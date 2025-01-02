import {Bitbucket as BitbucketClient} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import {PaginatedResponseData} from 'bitbucket/src/request/types';
import Bottleneck from 'bottleneck';
import dateformat from 'date-format';
import {AirbyteLogger, toDate, wrapApiError} from 'faros-airbyte-cdk';
import {
  Branch,
  Commit,
  Deployment,
  Environment,
  Pipeline,
  PipelineStep,
  PRActivity,
  PRDiffStat,
  PullRequest,
  PullRequestOrActivity,
  Repository,
  Tag,
  Workspace,
  WorkspaceUser,
} from 'faros-airbyte-common/bitbucket';
import {bucket, validateBucketingConfig} from 'faros-airbyte-common/common';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import VErrorType, {VError} from 'verror';

import {CommitHashMatcher} from './commit-hash-matcher';
import {RunMode} from './streams/common';
import {BitbucketConfig} from './types';

const DEFAULT_BITBUCKET_URL = 'https://api.bitbucket.org/2.0';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BUCKET_ID = 1;
const DEFAULT_BUCKET_TOTAL = 1;

export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_CONCURRENCY_LIMIT = 5;
export const DEFAULT_RUN_MODE = RunMode.Full;

interface BitbucketResponse<T> {
  data: T | {values: T[]};
}

export class Bitbucket {
  private static bitbucket: Bitbucket = null;
  private readonly limiter: Bottleneck;
  private readonly commitHashes: Set<string> = new Set();

  constructor(
    private readonly client: APIClient,
    private readonly pageSize: number,
    private readonly bucketId: number,
    private readonly bucketTotal: number,
    private readonly concurrencyLimit: number,
    private readonly logger: AirbyteLogger,
    private readonly requestedStreams: Set<string>
  ) {
    this.limiter = new Bottleneck({
      maxConcurrent: concurrencyLimit,
      minTime: 100,
    });
  }

  static instance(config: BitbucketConfig, logger: AirbyteLogger): Bitbucket {
    if (Bitbucket.bitbucket) return Bitbucket.bitbucket;

    const [passed, errorMessage] = Bitbucket.validateConfig(config);
    if (!passed) {
      logger.error(errorMessage);
      throw new VError(errorMessage);
    }

    validateBucketingConfig(config, logger.info.bind(logger));

    const auth = config.token
      ? {token: config.token}
      : {username: config.username, password: config.password};

    const baseUrl = config.api_url ?? DEFAULT_BITBUCKET_URL;
    const client = new BitbucketClient({baseUrl, auth});
    Bitbucket.bitbucket = new Bitbucket(
      client,
      config.page_size ?? DEFAULT_PAGE_SIZE,
      config.bucket_id ?? DEFAULT_BUCKET_ID,
      config.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      config.concurrency_limit ?? DEFAULT_CONCURRENCY_LIMIT,
      logger,
      config.requestedStreams ?? new Set()
    );
    return Bitbucket.bitbucket;
  }

  private buildInnerError(err: any): VErrorType {
    const {message, error, status} = err;
    return new VError({info: {status, error: error?.error?.message}}, message);
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.workspaces.getWorkspaces();
    } catch (error: any) {
      let errorMessage;
      try {
        errorMessage = error.message ?? error.statusText ?? wrapApiError(error);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      throw new VError(
        `Please verify your credentials are correct. Error: ${errorMessage}`
      );
    }
  }

  private static validateConfig(config: BitbucketConfig): [boolean, string] {
    const existToken = config.token && !config.username && !config.password;
    const existAuth = !config.token && config.username && config.password;

    if (!existToken && !existAuth) {
      return [
        false,
        'Invalid authentication details. Please provide either only the ' +
          'Bitbucket access token or Bitbucket username and password',
      ];
    }

    try {
      config.api_url && new URL(config.api_url);
    } catch (error) {
      return [false, 'The server_url: must be a valid url'];
    }

    return [true, undefined];
  }

  isRepoInBucket(workspace: string, repo: string): boolean {
    const data = `${workspace}/${repo}`;
    return (
      bucket('farosai/airbyte-bitbucket-source', data, this.bucketTotal) ===
      this.bucketId
    );
  }

  async *getBranches(
    workspace: string,
    repoSlug: string
  ): AsyncGenerator<Branch> {
    try {
      const func = (): Promise<BitbucketResponse<Branch>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listBranches({
            workspace,
            repo_slug: repoSlug,
            pagelen: this.pageSize,
          })
        ) as any;

      yield* this.paginate<Branch>(func, (data) => this.buildBranch(data));
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching branch(es) for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  async *getCommits(
    workspace: string,
    repoSlug: string,
    mainBranch: string,
    startDate: Date,
    endDate: Date
  ): AsyncGenerator<Commit> {
    try {
      const func = (): Promise<BitbucketResponse<Commit>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listCommits({
            workspace,
            repo_slug: repoSlug,
            pagelen: this.pageSize,
            include: [mainBranch],
          })
        ) as any;
      const isInRange = (data: Commit): boolean => {
        const date = toDate(data.date);
        return date >= startDate && date <= endDate;
      };

      for await (const commit of this.paginate<Commit>(
        func,
        (data) => this.buildCommit(data),
        isInRange
      )) {
        // We only store these hashes for the sake of resolving the full
        // merge commit hash for pull requests.
        if (this.requestedStreams.has('pull_requests_with_activities')) {
          this.commitHashes.add(commit.hash);
        }
        yield commit;
      }
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching commit(s) for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  async *getDeployments(
    workspace: string,
    repoSlug: string
  ): AsyncGenerator<Deployment> {
    try {
      const func = (): Promise<BitbucketResponse<Deployment>> =>
        this.limiter.schedule(() =>
          this.client.deployments.list({
            workspace,
            repo_slug: repoSlug,
            pagelen: this.pageSize,
          })
        ) as any;

      const iter = this.paginate<Deployment>(func, (data) =>
        this.buildDeployment(data)
      );

      for await (const deployment of iter) {
        const res = {...deployment};

        try {
          res.fullEnvironment = await this.getEnvironment(
            workspace,
            repoSlug,
            deployment.environment.uuid
          );
        } catch (err) {
          const stringifiedError = JSON.stringify(this.buildInnerError(err));
          this.logger.warn(
            `Error fetching environment for repository: ${repoSlug}. Error: ${stringifiedError}`
          );
        }
        yield res;
      }
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching deployments for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  @Memoize(
    (workspace: string, repoSlug: string, envID: string): string =>
      `${workspace};${repoSlug};${envID}`
  )
  async getEnvironment(
    workspace: string,
    repoSlug: string,
    envID: string
  ): Promise<Environment> {
    try {
      return await this.doGetEnvironment(workspace, repoSlug, envID);
    } catch (err) {
      try {
        this.logger.debug(
          `Error fetching ${envID} environment for repository "${workspace}/${repoSlug}"`
        );
        return await this.doGetEnvironment(
          workspace,
          repoSlug,
          encodeURIComponent(envID)
        );
      } catch (err2) {
        throw new VError(
          this.buildInnerError(err2),
          'Error fetching %s environment for repository %s/%s',
          envID,
          workspace,
          repoSlug
        );
      }
    }
  }

  private async doGetEnvironment(
    workspace: string,
    repoSlug: string,
    envID: string
  ): Promise<Environment> {
    const {data} = (await this.limiter.schedule(() =>
      this.client.deployments.getEnvironment({
        workspace,
        repo_slug: repoSlug,
        environment_uuid: envID,
      })
    )) as any;
    return this.buildEnvironment(data);
  }

  @Memoize(
    (workspace: string, repoSlug: string): string => `${workspace};${repoSlug}`
  )
  async getRepository(
    workspace: string,
    repoSlug: string
  ): Promise<Repository> {
    const response = await this.client.repositories.get({
      workspace,
      repo_slug: repoSlug,
    });
    return this.buildRepository(response.data, workspace);
  }

  @Memoize(
    (workspace: string, repoSlug: string): string => `${workspace};${repoSlug}`
  )
  async getPipelines(
    workspace: string,
    repoSlug: string
  ): Promise<ReadonlyArray<Pipeline>> {
    const results: Pipeline[] = [];
    try {
      const func = (): Promise<BitbucketResponse<Pipeline>> =>
        this.limiter.schedule(() =>
          this.client.pipelines.list({
            workspace,
            repo_slug: repoSlug,
            pagelen: this.pageSize,
            sort: '-created_on', // sort by created_on field in desc order
          })
        ) as any;

      const pipelines = this.paginate<Pipeline>(func, (data) =>
        this.buildPipeline(data)
      );
      for await (const pipeline of pipelines) {
        results.push(pipeline);
      }
      return results;
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching pipeline(s) for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  async *getPipelineSteps(
    workspace: string,
    repoSlug: string,
    pipelineUUID: string
  ): AsyncGenerator<PipelineStep> {
    try {
      const func = (): Promise<BitbucketResponse<PipelineStep>> =>
        this.limiter.schedule(() =>
          this.client.pipelines.listSteps({
            workspace,
            repo_slug: repoSlug,
            pipeline_uuid: pipelineUUID,
            pagelen: this.pageSize,
          })
        ) as any;

      yield* this.paginate<PipelineStep>(func, (data) =>
        this.buildPipelineStep(data)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching PipelineSteps(s) for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  async *getPullRequestsWithActivities(
    workspace: string,
    repoSlug: string,
    startDate: Date,
    endDate: Date,
    emitActivities: boolean = false
  ): AsyncGenerator<PullRequestOrActivity> {
    try {
      /**
       * By default only open pull requests are returned by API. We use query
       * parameters to ensure we retrieve all states. Using query as substitute
       * for repeatable states:https://github.com/MunifTanjim/node-bitbucket/issues/74
       *  */
      const states =
        '(state = "DECLINED" OR state = "MERGED" OR state = "OPEN" OR state = "SUPERSEDED")';
      const query =
        states +
        ` AND updated_on >= ${formatDate(startDate)} AND updated_on <= ${formatDate(endDate)}`;
      const func = (): Promise<BitbucketResponse<PullRequest>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listPullRequests({
            workspace,
            repo_slug: repoSlug,
            paglen: Math.min(this.pageSize, 50), // page size is limited to 50 for PR activities
            q: query,
          })
        ) as any;

      const iter = this.paginate<PullRequest>(func, (data) =>
        this.buildPullRequest(data)
      );

      const commitHashMatcher = new CommitHashMatcher(this.commitHashes);

      for await (const pr of iter) {
        const mergeCommitHash = pr.mergeCommit?.hash
          ? commitHashMatcher.match(pr.mergeCommit.hash)
          : null;
        const mergeCommit = mergeCommitHash ? {hash: mergeCommitHash} : null;
        const pullRequest = {...pr, repositorySlug: repoSlug, mergeCommit};
        try {
          pullRequest.diffStats = await this.getPRDiffStats(
            workspace,
            repoSlug,
            String(pr.id)
          );
        } catch (err) {
          const stringifiedError = JSON.stringify(this.buildInnerError(err));
          this.logger.warn(
            `Failed fetching diff stats for pull request #${pr.id} in repo ${workspace}/${repoSlug}. Error: ${stringifiedError}`
          );
        }
        const commits = new Set<string>();
        let mergedAt = undefined;
        try {
          const iterActivities = this.getPRActivities(
            workspace,
            repoSlug,
            String(pr.id),
            startDate,
            endDate
          );

          for await (const activity of iterActivities) {
            const change: any =
              activity?.comment ??
              activity?.update ??
              activity?.approval ??
              activity?.changes_requested;

            const date = toDate(
              change?.date ?? change?.updated_on ?? change?.created_on
            );
            if (activity?.update?.state === 'MERGED' && date) {
              mergedAt = !mergedAt || date > mergedAt ? date : mergedAt;
            }
            const commit = activity?.update?.source?.commit?.hash;
            if (commit) commits.add(commit);

            if (emitActivities) {
              yield {type: 'PullRequestActivity', activity};
            }
          }
        } catch (err) {
          const stringifiedError = JSON.stringify(this.buildInnerError(err));
          this.logger.warn(
            `Failed fetching activities for pull request #${pr.id} in repo ${workspace}/${repoSlug}. Error: ${stringifiedError}`
          );
        }
        pullRequest.calculatedActivity = {commitCount: commits.size, mergedAt};
        yield {type: 'PullRequest', pullRequest};
      }
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching pull requests for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  async *getPRActivities(
    workspace: string,
    repoSlug: string,
    pullRequestId: string,
    startDate: Date,
    endDate: Date
  ): AsyncGenerator<PRActivity> {
    try {
      const func = (): Promise<BitbucketResponse<PRActivity>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listPullRequestActivities({
            workspace,
            repo_slug: repoSlug,
            pull_request_id: pullRequestId,
            pagelen: Math.min(this.pageSize, 50), // page size is limited to 50 for PR activities
            q: `updated_on >= ${formatDate(startDate)} AND updated_on <= ${formatDate(endDate)}`,
          })
        ) as any;

      yield* this.paginate<PRActivity>(func, (data) =>
        this.buildPRActivity(data, workspace, repoSlug)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching activities for pull request %s in repo %s/%s',
        pullRequestId,
        workspace,
        repoSlug
      );
    }
  }

  async getPRDiffStats(
    workspace: string,
    repoSlug: string,
    pullRequestId: string
  ): Promise<ReadonlyArray<PRDiffStat>> {
    const results: PRDiffStat[] = [];
    try {
      const func = (): Promise<BitbucketResponse<PRDiffStat>> =>
        this.limiter.schedule(() =>
          this.client.pullrequests.getDiffStat({
            workspace,
            repo_slug: repoSlug,
            pull_request_id: pullRequestId,
            pagelen: this.pageSize,
          })
        ) as any;

      const diffStats = this.paginate<PRDiffStat>(func, (data) =>
        this.buildPRDiffStat(data)
      );
      for await (const diffStat of diffStats) {
        results.push(diffStat);
      }
      return results;
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching diff stats for pull request %s in repository %s/%s',
        pullRequestId,
        workspace,
        repoSlug
      );
    }
  }

  @Memoize(
    (
      workspace: string,
      reposToInclude: ReadonlyArray<string>,
      lastUpdated?: string
    ): string => `${workspace};${reposToInclude};${lastUpdated ?? ''}`
  )
  async getRepositories(workspace: string): Promise<ReadonlyArray<Repository>> {
    const results: Repository[] = [];
    try {
      const func = (): Promise<BitbucketResponse<Repository>> =>
        this.limiter.schedule(() =>
          this.client.repositories.list({workspace, pagelen: this.pageSize})
        );

      const repos = this.paginate<Repository>(func, (data) =>
        this.buildRepository(data, workspace)
      );
      for await (const repo of repos) {
        if (!this.isRepoInBucket(workspace, repo.slug)) {
          continue;
        }
        results.push(repo);
      }
      return results;
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching repositories for workspace: %s.',
        workspace
      );
    }
  }

  async getWorkspaceIds(): Promise<ReadonlyArray<string>> {
    const workspaces = [];
    for await (const workspace of this.getWorkspaces()) {
      workspaces.push(workspace.slug);
    }
    return workspaces;
  }

  async *getWorkspaces(): AsyncGenerator<Workspace> {
    try {
      const func = (): Promise<BitbucketResponse<Workspace>> =>
        this.limiter.schedule(() =>
          this.client.workspaces.getWorkspaces({pagelen: this.pageSize})
        );

      yield* this.paginate<Workspace>(func, (data) =>
        this.buildWorkspace(data)
      );
    } catch (err) {
      throw new VError(this.buildInnerError(err), 'Error fetching workspaces');
    }
  }

  async getWorkspace(workspace: string): Promise<Workspace> {
    try {
      const response = await this.client.workspaces.getWorkspace({workspace});
      return this.buildWorkspace(response.data);
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching workspace: %s',
        workspace
      );
    }
  }

  async *getWorkspaceUsers(workspace: string): AsyncGenerator<WorkspaceUser> {
    try {
      const func = (): Promise<BitbucketResponse<WorkspaceUser>> =>
        this.limiter.schedule(() =>
          this.client.workspaces.getMembersForWorkspace({
            workspace,
            pagelen: this.pageSize,
          })
        );

      yield* this.paginate<WorkspaceUser>(func, (data) =>
        this.buildWorkspaceUser(data)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching users for workspace: %s',
        workspace
      );
    }
  }

  async *getTags(workspace: string, repoSlug: string): AsyncGenerator<Tag> {
    try {
      // Bitbucket does not support filtering tags by date nor sorting by date,
      // so, we always pull all tags
      const func = (): Promise<BitbucketResponse<Tag>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listTags({
            workspace,
            repo_slug: repoSlug,
            pagelen: this.pageSize,
          })
        ) as any;

      yield* this.paginate<Tag>(func, (data) => this.buildTag(data));
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching tags for repository %s/%s',
        workspace,
        repoSlug
      );
    }
  }

  private async nextPage<T>(
    currentData: PaginatedResponseData<any>
  ): Promise<T | undefined> {
    if (!this.client.hasNextPage(currentData)) {
      return;
    }

    const {data}: {data: T} = await this.limiter.schedule(() =>
      this.client.getNextPage(currentData)
    );
    return data;
  }

  private async *paginate<T>(
    func: () => Promise<BitbucketResponse<T>>,
    buildTo: (data: Dictionary<any>) => T,
    isInRange?: (data: T) => boolean
  ): AsyncGenerator<T> {
    let {data}: {data: T | {values: T[]}} = await func();

    if (!data) return undefined;
    const existValues = data['values'] && Array.isArray(data['values']);
    if (!existValues) {
      yield buildTo(data) as any;
      return undefined;
    }

    do {
      for (const item of (data as {values: T[]}).values) {
        const buildedItem = buildTo(item);
        const isValid = !isInRange || isInRange(buildedItem);
        if (isValid) {
          yield buildedItem;
        }
      }

      data = await this.nextPage(data);
    } while (data);
  }

  private buildBranch(data: Dictionary<any>): Branch {
    const {
      target,
      target: {author, parents, repository: repo},
    } = data;

    return {
      name: data.name,
      links: {htmlUrl: data.links?.html?.href},
      defaultMergeStrategy: data.default_merge_strategy,
      mergeStrategies: data.merge_strategies,
      type: data.type,
      target: {
        hash: target.hash,
        repository: {
          links: {htmlUrl: repo.links?.html?.href},
          type: repo.type,
          name: repo.name,
          fullName: repo.full_name,
          uuid: repo.uuid,
        },
        links: {htmlUrl: target.links?.html?.href},
        author: {
          raw: author.raw,
          type: author.type,
          user: {
            displayName: author?.user?.display_name,
            uuid: author?.user?.uuid,
            links: {htmlUrl: author?.user?.links?.html?.href},
            type: author?.user?.type,
            nickname: author?.user?.nickname,
            accountId: author?.user?.account_id,
          },
        },
        parents: parents.map((parent) => ({
          hash: parent.hash,
          links: {htmlUrl: parent.links?.html?.href},
        })),
        date: target.date,
        message: target.message,
        type: target.type,
      },
    };
  }

  private buildCommit(data: Dictionary<any>): Commit {
    return {
      hash: data.hash,
      date: data.date,
      message: data.message,
      type: data.type,
      repository: {
        fullName: data.repository.full_name,
      },
      links: {
        htmlUrl: data.links?.html?.href,
      },
      author: {
        user: {
          displayName: data.author.user?.display_name,
          uuid: data.author.user?.uuid,
          type: data.author.user?.type,
          accountId: data.author.user?.account_id,
          links: {
            htmlUrl: data.author.user?.links?.html?.href,
          },
        },
      },
    };
  }

  private buildDeployment(data: Dictionary<any>): Deployment {
    const {release, state, deployable} = data;
    return {
      uuid: data.uuid,
      name: data?.name,
      type: data.type,
      environment: {uuid: data.environment?.uuid, type: data.environment?.type},
      step: {uuid: data.step?.uuid, type: data.step?.type},
      commit: {
        type: release?.commit.type,
        hash: release?.commit.hash,
        links: {htmlUrl: release?.commit?.links?.html?.href},
      },
      lastUpdateTime: data.last_update_time,
      key: data.key,
      state: {
        type: state?.type,
        name: state?.name,
        status: {name: state?.status?.name, type: state?.status?.type},
        url: state?.url,
        startedOn: state?.started_on,
        completedOn: state?.completed_on,
      },
      version: data.version,
      deployable: {
        type: deployable.type,
        uuid: deployable.uuid,
        pipeline: {
          uuid: deployable?.pipeline.uuid,
          type: deployable?.pipeline.type,
        },
        key: deployable.key,
        name: deployable.name,
        url: deployable.url,
        commit: {
          type: deployable?.commit?.type,
          hash: deployable?.commit?.hash,
          links: {
            htmlUrl: deployable?.commit?.links?.html?.href,
          },
        },
        createdOn: deployable.created_on,
      },
      release: {
        type: release?.type,
        uuid: release?.uuid,
        pipeline: {
          uuid: release?.pipeline.uuid,
          type: release?.pipeline.type,
        },
        key: release?.key,
        name: release?.name,
        url: release?.url,
        commit: {
          type: release?.commit.type,
          hash: release?.commit.hash,
          links: {
            htmlUrl: release?.commit.links?.html?.href,
          },
        },
        createdOnn: release?.commit.created_on,
      },
    };
  }

  private buildEnvironment(data: Dictionary<any>): Environment {
    return {
      uuid: data.uuid,
      name: data.name,
      type: data.type,
      slug: data.slug,
      category: {name: data.category.name},
      restrictions: {
        adminOnly: data?.restrictions?.admin_only,
        type: data.restrictions.type,
      },
      environmentLockEnabled: data.environment_lock_enabled,
      lock: {type: data.lock.type, name: data.lock.name},
      deploymentGateEnabled: data.deployment_gate_enabled,
      rank: data.rank,
      hidden: data.hidden,
      environmentType: {
        name: data.environment_type?.name,
        type: data.environment_type?.type,
        rank: data.environment_type?.rank,
      },
    };
  }

  private buildPipeline(data: Dictionary<any>): Pipeline {
    return {
      uuid: data.uuid,
      type: data.type,
      repository: {
        name: data.repository.name,
        type: data.repository.type,
        fullName: data.repository.full_name,
        uuid: data.repository.uuid,
        links: {
          htmlUrl: data.repository?.links?.html?.href,
        },
      },
      state: {
        type: data.state.type,
        name: data.state.name,
        stage: {name: data.state?.stage?.name, type: data.state?.stage?.type},
      },
      buildNumber: data.build_number,
      creator: {
        displayName: data.creator.display_name,
        accountId: data.creator.account_id,
        nickname: data.creator.nickname,
        type: data.creator.type,
        uuid: data.creator.uuid,
        links: {
          htmlUrl: data.creator?.links?.html?.href,
        },
      },
      createdOn: data.created_on,
      target: {
        type: data.target?.type,
        refType: data.target?.ref_type,
        refName: data.target?.ref_name,
        selector: {type: data.target?.selector?.type},
        commit: {
          type: data.target?.commit?.type,
          hash: data.target?.commit?.hash,
          links: {
            htmlUrl: data.target?.commit?.links?.html?.href,
          },
        },
      },
      trigger: {
        name: data.trigger?.name,
        type: data.trigger?.type,
      },
      runNumber: data.run_number,
      durationInSeconds: data.duration_in_seconds,
      buildSecondsUsed: data.build_seconds_used,
      firstSuccessful: data.first_successful,
      expired: data.expired,
      links: {
        htmlUrl: data.links?.html?.href,
      },
      hasVariables: data.has_variables,
    };
  }

  private buildPipelineStep(data: Dictionary<any>): PipelineStep {
    return {
      completedOn: data.completed_on,
      uuid: data.uuid,
      startedOn: data.started_on,
      type: data.type,
      name: data.name,
      runNumber: data.run_number,
      maxTime: data.max_time,
      buildSecondsUsed: data.build_seconds_used,
      durationInSeconds: data.duration_in_seconds,
      pipeline: {type: data.pipeline.type, uuid: data.pipeline.uuid},
      image: {name: data.image.name},
      scriptCommands: data.script_commands,
      state: {
        type: data.state?.type,
        name: data.state?.name,
        result: {
          name: data.state?.result?.name,
          type: data.state?.result?.type,
        },
      },
      trigger: {type: data.trigger.type},
      teardownCommands: data.teardown_commands,
      setupCommands: data.setup_commands,
    };
  }

  private buildPullRequest(data: Dictionary<any>): PullRequest {
    return {
      description: data.description,
      title: data.title,
      closeSourceBranch: data.close_source_branch,
      type: data.type,
      id: data.id,
      createdOn: data.created_on,
      commentCount: data.comment_count,
      state: data.state,
      taskCount: data.task_count,
      reason: data.reason,
      updatedOn: data.updated_on,
      links: {
        declineUrl: data.links?.decline?.href,
        diffstatUrl: data.links?.diffstat?.href,
        commitsUrl: data.links?.commits?.href,
        commentsUrl: data.links?.comments?.href,
        mergeUrl: data.links?.merge?.href,
        htmlUrl: data.links?.html?.href,
        activityUrl: data.links?.activity?.href,
        diffUrl: data.links?.diff?.href,
        approveUrl: data.links?.approve?.href,
        statusesUrl: data.links?.statuses?.href,
      },
      destination: {
        commit: {
          hash: data.destination?.commit?.hash,
          type: data.destination?.commit?.type,
          links: {
            htmlUrl: data.destination?.commit?.links?.html?.href,
          },
        },
        repository: {
          type: data.destination?.repository?.type,
          name: data.destination?.repository?.name,
          fullName: data.destination?.repository?.full_name,
          uuid: data.destination?.repository?.uuid,
          links: {
            htmlUrl: data.destination?.repository?.links?.html?.href,
          },
        },
        branch: {
          name: data.destination?.branch?.name,
        },
      },
      summary: {
        raw: data.summary?.raw,
        markup: data.summary?.markup,
        html: data.summary?.html,
        type: data.summary?.type,
      },
      source: {
        commit: {
          hash: data.source?.commit?.hash,
          type: data.source?.commit?.type,
          links: {
            htmlUrl: data.source?.commit?.links?.html?.href,
          },
        },
        repository: {
          type: data.source?.repository?.type,
          name: data.source?.repository?.name,
          fullName: data.source?.repository?.full_name,
          uuid: data.source?.repository?.uuid,
          links: {
            htmlUrl: data.source?.repository?.links?.html?.href,
          },
        },
        branch: {
          name: data.source?.branch?.name,
        },
      },
      author: {
        displayName: data.author.display_name,
        uuid: data.author.uuid,
        type: data.author.type,
        accountId: data.author.account_id,
        links: {
          htmlUrl: data.author.links?.html?.href,
        },
      },
      mergeCommit: data.merge_commit
        ? {
            hash: data.merge_commit.hash,
          }
        : null,
      closedBy: data.closed_by
        ? {
            displayName: data.closed_by.display_name,
            uuid: data.closed_by.uuid,
            type: data.closed_by.type,
            accountId: data.closed_by.account_id,
            links: {
              htmlUrl: data.closed_by.links?.html?.href,
            },
          }
        : null,
    };
  }

  private buildPRActivity(
    data: Dictionary<any>,
    workspace: string,
    repoSlug: string
  ): PRActivity {
    return {
      approval: data.approval
        ? {
            ...data.approval,
            user: {
              displayName: data.approval?.user.display_name,
              uuid: data.approval?.user.uuid,
              type: data.approval?.user.type,
              nickname: data.approval?.user.nickname,
              accountId: data.approval?.user.account_id,
              links: {
                htmlUrl: data.approval?.user.links?.html?.href,
              },
            },
          }
        : undefined,
      changes_requested: data.changes_requested
        ? {
            ...data.changes_requested,
            user: {
              displayName: data.changes_requested?.user.display_name,
              uuid: data.changes_requested?.user.uuid,
              type: data.changes_requested?.user.type,
              nickname: data.changes_requested?.user.nickname,
              accountId: data.changes_requested?.user.account_id,
              links: {
                htmlUrl: data.changes_requested?.user.links?.html?.href,
              },
            },
          }
        : undefined,
      update: data.update
        ? {
            description: data.update?.description,
            title: data.update?.title,
            state: data.update?.state,
            reason: data.update?.reason,
            date: data.update?.date,
            reviewers: data.update?.reviewers,
            destination: {
              commit: {
                hash: data.update?.destination?.commit?.hash,
                type: data.update?.destination?.type,
                links: {
                  htmlUrl: data.update?.destination?.links?.html?.href,
                },
              },
              repository: {
                type: data.update?.destination?.type,
                name: data.update?.destination?.name,
                fullName: data.update?.destination?.full_name,
                uuid: data.update?.destination?.uuid,
                links: {
                  htmlUrl: data.update?.destination?.links?.html?.href,
                },
              },
              branch: {
                name: data.update?.destination?.branch?.name,
              },
            },
            source: {
              commit: {
                hash: data.update?.source?.commit?.hash,
                type: data.update?.source?.commit?.type,
                links: {
                  htmlUrl: data.update?.source?.commit?.links?.html?.href,
                },
              },
              repository: {
                type: data.update?.source?.repository?.type,
                name: data.update?.source?.repository?.name,
                fullName: data.update?.source?.repository?.full_name,
                uuid: data.update?.source?.repository?.uuid,
                links: {
                  htmlUrl: data.update?.source?.repository?.links?.html?.href,
                },
              },
              branch: {
                name: data.update?.source?.branch?.name,
              },
            },
            author: {
              displayName: data.update?.author.display_name,
              uuid: data.update?.author.uuid,
              type: data.update?.author.type,
              accountId: data.update?.author.account_id,
              links: {
                htmlUrl: data.update?.author.links?.html?.href,
              },
            },
            changes: {
              status: {
                new: data.update?.changes.status?.new,
                old: data.update?.changes.status?.old,
              },
            },
          }
        : undefined,
      pullRequest: {
        type: data.pull_request.type,
        title: data.pull_request.title,
        id: data.pull_request.id,
        links: {
          htmlUrl: data.pull_request.links?.html?.href,
        },
        workspace,
        repositorySlug: repoSlug,
      },
      comment: data.comment
        ? {
            ...data.comment,
            user: {
              displayName: data.comment?.user.display_name,
              uuid: data.comment?.user.uuid,
              type: data.comment?.user.type,
              nickname: data.comment?.user.nickname,
              accountId: data.comment?.user.account_id,
              links: {
                htmlUrl: data.comment?.user.links?.html?.href,
              },
            },
          }
        : undefined,
    };
  }

  private buildPRDiffStat(data: Dictionary<any>): PRDiffStat {
    return {
      status: data.status,
      linesRemoved: data.lines_removed ?? 0,
      linesAdded: data.lines_added ?? 0,
      old: data?.old
        ? {
            path: data.old?.path,
            escapedPath: data.old?.escaped_path,
          }
        : null,
      new: data?.new
        ? {
            path: data.new?.path,
            escapedPath: data.new?.escaped_path,
          }
        : null,
    };
  }

  private buildRepository(
    data: Dictionary<any>,
    workspace: string
  ): Repository {
    return {
      workspace,
      slug: data.slug,
      fullName: data.full_name,
      description: data.description,
      isPrivate: data.is_private,
      language: data.language,
      size: data.size,
      htmlUrl: data.links?.html?.href,
      createdOn: data.created_on,
      updatedOn: data.updated_on,
      mainBranch: data.mainbranch?.name,
    };
  }

  private buildWorkspaceUser(data: Dictionary<any>): WorkspaceUser {
    return {
      user: {
        displayName: data.user.display_name,
        uuid: data.user.uuid,
        type: data.user.type,
        accountId: data.user.account_id,
        links: {
          htmlUrl: data.user.links?.html?.href,
        },
      },
      workspace: {
        slug: data.workspace.slug,
        uuid: data.workspace.uuid,
      },
    };
  }

  private buildWorkspace(data: Dictionary<any>): Workspace {
    return {
      uuid: data.uuid,
      createdOn: data.created_on,
      type: data.type,
      slug: data.slug,
      isPrivate: data.is_private,
      name: data.name,
      links: {
        ownersUrl: data.links?.owners?.href,
        repositoriesUrl: data.links?.repositories?.href,
        htmlUrl: data.links?.html?.href,
      },
    };
  }

  private buildTag(data: Dictionary<any>): Tag {
    return {
      name: data.name,
      message: data.message,
      target: {
        hash: data.target?.hash,
      },
      repository: {
        fullName: data.target?.repository?.full_name,
      },
    };
  }
}

function formatDate(date: Date): string {
  return dateformat.asString(dateformat.ISO8601_WITH_TZ_OFFSET_FORMAT, date);
}
