import {Bitbucket as BitbucketClient} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import {PaginatedResponseData} from 'bitbucket/src/request/types';
import Bottleneck from 'bottleneck';
import {AirbyteLogger, toDate, wrapApiError} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import VErrorType, {VError} from 'verror';

import {
  BitbucketConfig,
  Branch,
  Commit,
  Deployment,
  DiffStat,
  Environment,
  Issue,
  Pipeline,
  PipelineStep,
  PRActivity,
  PRDiffStat,
  PullRequest,
  Repository,
  Workspace,
  WorkspaceUser,
} from './types';

const DEFAULT_BITBUCKET_URL = 'https://api.bitbucket.org/2.0';
const DEFAULT_PAGELEN = 100;
export const DEFAULT_LIMITER = new Bottleneck({maxConcurrent: 5, minTime: 100});

interface BitbucketResponse<T> {
  data: T | {values: T[]};
}

export class Bitbucket {
  private readonly limiter = DEFAULT_LIMITER;
  private static bitbucket: Bitbucket = null;

  constructor(
    private readonly client: APIClient,
    private readonly workspace: string,
    private readonly pagelen: number,
    private readonly logger: AirbyteLogger,
    readonly startDate: Date
  ) {}

  static instance(config: BitbucketConfig, logger: AirbyteLogger): Bitbucket {
    if (Bitbucket.bitbucket) return Bitbucket.bitbucket;

    const [passed, errorMessage] = Bitbucket.isValidateConfig(config);
    if (!passed) {
      logger.error(errorMessage);
      throw new VError(errorMessage);
    }

    const auth = config.token
      ? {token: config.token}
      : {username: config.username, password: config.password};

    const baseUrl = config.serverUrl || DEFAULT_BITBUCKET_URL;
    const client = new BitbucketClient({baseUrl, auth});
    const pagelen = config.pagelen || DEFAULT_PAGELEN;

    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    Bitbucket.bitbucket = new Bitbucket(
      client,
      config.workspace,
      pagelen,
      logger,
      startDate
    );
    logger.debug('Created Bitbucket instance');

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

  private static isValidateConfig(config: BitbucketConfig): [boolean, string] {
    const existToken = config.token && !config.username && !config.password;
    const existAuth = !config.token && config.username && config.password;

    if (!existToken && !existAuth) {
      return [
        false,
        'Invalid authentication details. Please provide either only the ' +
          'Bitbucket access token or Bitbucket username and password',
      ];
    }

    if (!config.workspace) {
      return [false, 'No workspace provided'];
    }
    if (!config.repositories) {
      return [false, 'No repository provided'];
    }
    if (!config.start_date) {
      return [false, 'start_date is null or empty'];
    }
    try {
      config.serverUrl && new URL(config.serverUrl);
    } catch (error) {
      return [false, 'server_url: must be a valid url'];
    }

    return [true, undefined];
  }

  private getStartDateMax(lastUpdatedAt?: string) {
    const startTime = new Date(lastUpdatedAt ?? 0);
    return startTime > this.startDate ? startTime : this.startDate;
  }

  async *getBranches(repoSlug: string): AsyncGenerator<Branch> {
    try {
      const func = (): Promise<BitbucketResponse<Branch>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listBranches({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pagelen: this.pagelen,
          })
        ) as any;

      yield* this.paginate<Branch>(func, (data) => this.buildBranch(data));
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching branch(es) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  async *getCommits(
    repoSlug: string,
    lastUpdated?: string
  ): AsyncGenerator<Commit> {
    try {
      const lastUpdatedMax = this.getStartDateMax(lastUpdated);
      const func = (): Promise<BitbucketResponse<Commit>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listCommits({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pagelen: this.pagelen,
          })
        ) as any;
      const isNew = (data: Commit): boolean =>
        new Date(data.date) > lastUpdatedMax;

      yield* this.paginate<Commit>(
        func,
        (data) => this.buildCommit(data),
        isNew
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching commit(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  async *getDeployments(repoSlug: string): AsyncGenerator<Deployment> {
    try {
      const func = (): Promise<BitbucketResponse<Deployment>> =>
        this.limiter.schedule(() =>
          this.client.deployments.list({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pagelen: this.pagelen,
          })
        ) as any;

      const iter = this.paginate<Deployment>(func, (data) =>
        this.buildDeployment(data)
      );

      for await (const deployment of iter) {
        const res = {...deployment};

        try {
          res.fullEnvironment = await this.getEnvironment(
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
        'Error fetching deployment(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  async getEnvironment(repoSlug: string, envID: string): Promise<Environment> {
    try {
      const {data} = (await this.limiter.schedule(() =>
        this.client.deployments.getEnvironment({
          workspace: this.workspace,
          repo_slug: repoSlug,
          environment_uuid: envID,
        })
      )) as any;

      return this.buildEnvironment(data);
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching %s environment for repository "%s/%s"',
        envID,
        this.workspace,
        repoSlug
      );
    }
  }

  async *getIssues(
    repoSlug: string,
    lastUpdated?: string
  ): AsyncGenerator<Issue> {
    const lastUpdatedMax = this.getStartDateMax(lastUpdated);
    const params: any = {
      workspace: this.workspace,
      repo_slug: repoSlug,
      pagelen: this.pagelen,
    };
    params.q = `updated_on > ${lastUpdatedMax}`;
    try {
      const func = (): Promise<BitbucketResponse<Issue>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listIssues(params)
        ) as any;

      yield* this.paginate<Issue>(func, (data) => this.buildIssue(data));
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching issue(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  @Memoize((repoSlug: string): string => repoSlug)
  async getPipelines(repoSlug: string): Promise<ReadonlyArray<Pipeline>> {
    const results: Pipeline[] = [];
    try {
      const func = (): Promise<BitbucketResponse<Pipeline>> =>
        this.limiter.schedule(() =>
          this.client.pipelines.list({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pagelen: this.pagelen,
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
        'Error fetching pipeline(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  async *getPipelineSteps(
    repoSlug: string,
    pipelineUUID: string
  ): AsyncGenerator<PipelineStep> {
    try {
      const func = (): Promise<BitbucketResponse<PipelineStep>> =>
        this.limiter.schedule(() =>
          this.client.pipelines.listSteps({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pipeline_uuid: pipelineUUID,
            pagelen: this.pagelen,
          })
        ) as any;

      yield* this.paginate<PipelineStep>(func, (data) =>
        this.buildPipelineStep(data)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching PipelineSteps(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  @Memoize((repoSlug: string, lastUpdated?: string): string =>
    repoSlug.concat(lastUpdated ?? '')
  )
  async getPullRequests(
    repoSlug: string,
    lastUpdated?: string
  ): Promise<ReadonlyArray<PullRequest>> {
    const lastUpdatedMax = this.getStartDateMax(lastUpdated);
    try {
      const results: PullRequest[] = [];
      /**
       * By default only open pull requests are returned by API. We use query
       * parameters to ensure we retrieve all states. Using query as substitute
       * for repeatable states:https://github.com/MunifTanjim/node-bitbucket/issues/74
       *  */
      const states =
        '(state = "DECLINED" OR state = "MERGED" OR state = "OPEN" OR state = "SUPERSEDED")';
      const query = states + ` AND updated_on > ${lastUpdatedMax}`;

      const func = (): Promise<BitbucketResponse<PullRequest>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listPullRequests({
            workspace: this.workspace,
            repo_slug: repoSlug,
            paglen: Math.min(this.pagelen, 50), // page size is limited to 50 for PR activities
            q: query,
          })
        ) as any;

      const iter = this.paginate<PullRequest>(func, (data) =>
        this.buildPullRequest(data)
      );

      for await (const pr of iter) {
        const res = {...pr, repositorySlug: repoSlug};
        try {
          res.diffStat = await this.getPRDiffStats(repoSlug, String(pr.id));
        } catch (err) {
          this.logger.warn(
            `Failed fetching Diff Stat(s) for pull request #${pr.id} in repo ${this.workspace}/${repoSlug}`
          );
        }
        const commits = new Set<string>();
        let mergedAt = undefined;
        try {
          const iterActivities = this.getPRActivities(repoSlug, String(pr.id));

          for await (const activity of iterActivities) {
            const change: any =
              activity?.comment ??
              activity?.update ??
              activity?.approval ??
              activity?.changesRequested;

            const date = toDate(
              change?.date ?? change?.updatedOn ?? change?.createdOn
            );
            if (activity?.update?.state === 'MERGED' && date) {
              mergedAt = !mergedAt || date > mergedAt ? date : mergedAt;
            }
            const commit = activity?.update?.source?.commit?.hash;
            if (commit) commits.add(commit);
          }
        } catch (err) {
          this.logger.warn(
            `Failed fetching Activities(s) for pull request #${pr.id} in repo ${this.workspace}/${repoSlug}`
          );
        }
        res.calculatedActivity = {commitCount: commits.size, mergedAt};
        results.push(res);
      }
      return results;
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching PullRequest(s) for repository "%s/%s"',
        this.workspace,
        repoSlug
      );
    }
  }

  async *getPRActivities(
    repoSlug: string,
    pullRequestId?: string
  ): AsyncGenerator<PRActivity> {
    try {
      const func = (): Promise<BitbucketResponse<PRActivity>> =>
        this.limiter.schedule(() =>
          this.client.repositories.listPullRequestActivities({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pull_request_id: pullRequestId,
            pagelen: Math.min(this.pagelen, 50), // page size is limited to 50 for PR activities
          })
        ) as any;

      yield* this.paginate<PRActivity>(func, (data) =>
        this.buildPRActivity(data)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching activities for pull request %s in repo %s/%s',
        pullRequestId,
        this.workspace,
        repoSlug
      );
    }
  }

  async getPRDiffStats(
    repoSlug: string,
    pullRequestId?: string
  ): Promise<DiffStat> {
    const diffStats = {linesAdded: 0, linesDeleted: 0, filesChanged: 0};
    try {
      const func = (): Promise<BitbucketResponse<PRDiffStat>> =>
        this.limiter.schedule(() =>
          this.client.pullrequests.getDiffStat({
            workspace: this.workspace,
            repo_slug: repoSlug,
            pull_request_id: pullRequestId,
            pagelen: this.pagelen,
          })
        ) as any;

      const iter = this.paginate<PRDiffStat>(func, (data) =>
        this.buildPRDiffStat(data)
      );
      for await (const prDiffStat of iter) {
        diffStats.linesAdded += prDiffStat.linesAdded;
        diffStats.linesDeleted += prDiffStat.linesRemoved;
        diffStats.filesChanged += 1;
      }
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching diff stats for pull request %s in repository %s/%s',
        pullRequestId,
        this.workspace,
        repoSlug
      );
    }
    return diffStats;
  }

  async *getRepositories(lastUpdated?: string): AsyncGenerator<Repository> {
    try {
      const lastUpdatedMax = this.getStartDateMax(lastUpdated);
      const func = (): Promise<BitbucketResponse<Repository>> =>
        this.limiter.schedule(() =>
          this.client.repositories.list({
            workspace: this.workspace,
            pagelen: this.pagelen,
            sort: '-updated_on', // sort by updated_on field in desc order
          })
        );
      const isNew = (data: Repository): boolean =>
        new Date(data.updatedOn) > lastUpdatedMax;

      yield* this.paginate<Repository>(
        func,
        (data) => this.buildRepository(data),
        isNew
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching repositories for workspace: %s.',
        this.workspace
      );
    }
  }

  async *getWorkspaces(): AsyncGenerator<Workspace> {
    try {
      const func = (): Promise<BitbucketResponse<Workspace>> =>
        this.limiter.schedule(() =>
          this.client.workspaces.getWorkspaces({pagelen: this.pagelen})
        );

      yield* this.paginate<Workspace>(func, (data) =>
        this.buildWorkspace(data)
      );
    } catch (err) {
      throw new VError(this.buildInnerError(err), 'Error fetching workspaces');
    }
  }

  async *getWorkspaceUsers(): AsyncGenerator<WorkspaceUser> {
    try {
      const func = (): Promise<BitbucketResponse<WorkspaceUser>> =>
        this.limiter.schedule(() =>
          this.client.workspaces.getMembersForWorkspace({
            workspace: this.workspace,
            pagelen: this.pagelen,
          })
        );

      yield* this.paginate<WorkspaceUser>(func, (data) =>
        this.buildWorkspaceUser(data)
      );
    } catch (err) {
      throw new VError(
        this.buildInnerError(err),
        'Error fetching users for workspace: %s',
        this.workspace
      );
    }
  }

  private async nextPage<T>(
    currentData: PaginatedResponseData<any>
  ): Promise<T | undefined> {
    if (!this.client.hasNextPage(currentData)) {
      return;
    }

    const {data} = await this.limiter.schedule(() =>
      this.client.getNextPage(currentData)
    );
    return data;
  }

  private async *paginate<T>(
    func: () => Promise<BitbucketResponse<T>>,
    buildTo: (data: Dictionary<any>) => T,
    isNew?: (data: T) => boolean
  ): AsyncGenerator<T> {
    let {data} = await func();

    if (!data) return undefined;
    const existValues = 'values' in data && Array.isArray(data.values);
    if (!existValues) {
      yield buildTo(data) as any;
      return undefined;
    }

    do {
      for (const item of (data as {values: T[]}).values) {
        const buildedItem = buildTo(item);
        const isValid = !isNew || isNew(buildedItem);
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
      rendered: {
        message: {
          raw: data.rendered?.message?.raw,
          markup: data.rendered?.message?.markup,
          html: data.rendered?.message?.html,
          type: data.rendered?.message?.type,
        },
      },
      repository: {
        type: data.repository.type,
        name: data.repository.name,
        fullName: data.repository.full_name,
        uuid: data.repository.uuid,
        links: {
          htmlUrl: data.repository.links?.html?.href,
        },
      },
      links: {
        commentsUrl: data.links?.comments?.href,
        htmlUrl: data.links?.html?.href,
        diffUrl: data.links?.diff?.href,
        approveUrl: data.links?.approve?.href,
        statusesUrl: data.links?.statuses?.href,
      },
      author: {
        raw: data.author.raw,
        type: data.author.type,
        user: {
          displayName: data.author.user?.display_name,
          uuid: data.author.user?.uuid,
          type: data.author.user?.type,
          nickname: data.author.user?.nickname,
          accountId: data.author.user?.account_id,
          links: {
            htmlUrl: data.author.user?.links?.html?.href,
          },
        },
      },
      summary: {
        raw: data.summary.raw,
        markup: data.summary.markup,
        html: data.summary.html,
        type: data.summary.type,
      },
      parents: data.parents.map((p: Dictionary<any>) => ({
        hash: p.hash,
        type: p.type,
        links: {
          htmlUrl: p.links?.html?.href,
        },
      })),
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

  private buildIssue(data: Dictionary<any>): Issue {
    return {
      priority: data.priority,
      kind: data.kind,
      title: data.title,
      state: data.state,
      createdOn: data.created_on,
      updatedOn: data.updated_on,
      type: data.type,
      votes: data.votes,
      watches: data.watches,
      id: data.id,
      component: data.component,
      version: data.version,
      editedOn: data.edited_on,
      milestone: data.milestone,
      repository: {
        type: data.repository.type,
        name: data.repository.name,
        fullName: data.repository.full_name,
        uuid: data.repository.uuid,
        links: {
          htmlUrl: data.repository.links.links?.html?.href,
        },
      },
      links: {
        attachmentsUrl: data.links?.attachments?.href,
        watchUrl: data.links?.watch?.href,
        commentsUrl: data.links?.comments?.href,
        htmlUrl: data.links?.html?.href,
        voteUrl: data.links?.vote?.href,
      },
      reporter: {
        displayName: data.reporter.display_name,
        uuid: data.reporter.uuid,
        type: data.reporter.type,
        nickname: data.reporter.nickname,
        accountId: data.reporter.account_id,
        links: {
          htmlUrl: data.reporter.links.links?.html?.href,
        },
      },
      content: {
        raw: data.content.raw,
        markup: data.content.markup,
        html: data.content.html,
        type: data.content.type,
      },
      assignee: {
        displayName: data.assignee.display_name,
        uuid: data.assignee.uuid,
        type: data.assignee.type,
        nickname: data.assignee.nickname,
        accountId: data.assignee.account_id,
        links: {
          htmlUrl: data.assignee.links?.html?.href,
        },
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
        selector: {type: data.target?.selector.type},
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
          hash: data.destination.commit.hash,
          type: data.destination.commit.type,
          links: {
            htmlUrl: data.destination.commit.links?.html?.href,
          },
        },
        repository: {
          type: data.destination.repository.type,
          name: data.destination.repository.name,
          fullName: data.destination.repository.full_name,
          uuid: data.destination.repository.uuid,
          links: {
            htmlUrl: data.destination.repository.links?.html?.href,
          },
        },
        branch: {
          name: data.destination.branch.name,
        },
      },
      summary: {
        raw: data.summary.raw,
        markup: data.summary.markup,
        html: data.summary.html,
        type: data.summary.type,
      },
      source: {
        commit: {
          hash: data.source.commit.hash,
          type: data.source.commit.type,
          links: {
            htmlUrl: data.source.commit.links?.html?.href,
          },
        },
        repository: {
          type: data.source.repository.type,
          name: data.source.repository.name,
          fullName: data.source.repository.full_name,
          uuid: data.source.repository.uuid,
          links: {
            htmlUrl: data.source.repository.links?.html?.href,
          },
        },
        branch: {
          name: data.source.branch.name,
        },
      },
      author: {
        displayName: data.author.display_name,
        uuid: data.author.uuid,
        type: data.author.type,
        nickname: data.author.nickname,
        accountId: data.author.account_id,
        links: {
          htmlUrl: data.author.links?.html?.href,
        },
      },
      mergeCommit: data.merge_commit
        ? {
            hash: data.merge_commit.hash,
            type: data.merge_commit.type,
            links: {
              htmlUrl: data.merge_commit.links?.html?.href,
            },
          }
        : null,
      closedBy: data.closed_by
        ? {
            displayName: data.closed_by.display_name,
            uuid: data.closed_by.uuid,
            type: data.closed_by.type,
            nickname: data.closed_by.nickname,
            accountId: data.closed_by.account_id,
            links: {
              htmlUrl: data.closed_by.links?.html?.href,
            },
          }
        : null,
    };
  }

  private buildPRActivity(data: Dictionary<any>): PRActivity {
    return {
      update: {
        description: data.update?.description,
        title: data.update?.title,
        state: data.update?.state,
        reason: data.update?.reason,
        date: data.update?.date,
        reviewers: data.update?.reviewers,
        destination: {
          commit: {
            hash: data.update?.destination.commit.hash,
            type: data.update?.destination.type,
            links: {
              htmlUrl: data.update?.destination.links?.html?.href,
            },
          },
          repository: {
            type: data.update?.destination.type,
            name: data.update?.destination.name,
            fullName: data.update?.destination.full_name,
            uuid: data.update?.destination.uuid,
            links: {
              htmlUrl: data.update?.destination.links?.html?.href,
            },
          },
          branch: {
            name: data.update?.destination.branch.name,
          },
        },
        source: {
          commit: {
            hash: data.update?.source.commit.hash,
            type: data.update?.source.commit.type,
            links: {
              htmlUrl: data.update?.source.commit.links?.html?.href,
            },
          },
          repository: {
            type: data.update?.source.repository.type,
            name: data.update?.source.repository.name,
            fullName: data.update?.source.repository.full_name,
            uuid: data.update?.source.repository.uuid,
            links: {htmlUrl: data.update?.source.repository.links?.html?.href},
          },
          branch: {
            name: data.update?.source.branch.name,
          },
        },
        author: {
          displayName: data.update?.author.display_name,
          uuid: data.update?.author.uuid,
          type: data.update?.author.type,
          nickname: data.update?.author.nickname,
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
      },
      pullRequest: {
        type: data.pull_request.type,
        title: data.pull_request.title,
        id: data.pull_request.id,
        links: {
          htmlUrl: data.pull_request.links?.html?.href,
        },
      },
      comment: {
        deleted: data.comment?.deleted,
        createdOn: data.comment?.created_on,
        updatedOn: data.comment?.updated_on,
        type: data.comment?.type,
        id: data.comment?.id,
        links: {
          htmlUrl: data.comment?.links?.html?.href,
        },
        pullrequest: {
          type: data.comment?.pullrequest.type,
          title: data.comment?.pullrequest.title,
          id: data.comment?.pullrequest.id,
          links: {
            htmlUrl: data.comment?.pullrequest.links?.html?.href,
          },
        },
        content: {
          raw: data.comment?.content.raw,
          markup: data.comment?.content.markup,
          html: data.comment?.content.html,
          type: data.comment?.content.type,
        },
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
      },
    };
  }

  private buildPRDiffStat(data: Dictionary<any>): PRDiffStat {
    return {
      status: data.status,
      old: data.old,
      linesRemoved: data.lines_removed,
      linesAdded: data.lines_added,
      type: data.type,
      new: {
        path: data.new.path,
        escapedPath: data.new.escaped_path,
        type: data.new.type,
      },
    };
  }

  private buildRepository(data: Dictionary<any>): Repository {
    const {owner, project, workspace} = data;
    return {
      scm: data.scm,
      website: data.website,
      hasWiki: data.has_wiki,
      uuid: data.uuid,
      links: {
        branchesUrl: data.links?.branches?.href,
        htmlUrl: data.links?.html?.href,
      },
      forkPolicy: data.fork_policy,
      fullName: data.full_name,
      name: data.name,
      project: {
        links: {htmlUrl: project.links?.html?.href},
        type: project.type,
        name: project.name,
        key: project.key,
        uuid: project.uuid,
      },
      language: data.language,
      createdOn: data.created_on,
      mainBranch: {
        type: data.mainbranch.type,
        name: data.mainbranch.name,
      },
      workspace: {
        type: project.type,
        name: project.name,
        links: {htmlUrl: workspace.links?.html?.href},
        uuid: project.uuid,
      },
      hasIssues: data.has_issues,
      owner: {
        displayName: owner.display_name,
        type: owner.type,
        uuid: owner.uuid,
        links: {htmlUrl: owner.links?.html?.href},
      },
      updatedOn: data.updated_on,
      size: data.size,
      type: data.type,
      slug: data.slug,
      isPrivate: data.is_private,
      description: data.description,
    };
  }

  private buildWorkspaceUser(data: Dictionary<any>): WorkspaceUser {
    return {
      type: data.type,
      user: {
        displayName: data.user.display_name,
        uuid: data.user.uuid,
        type: data.user.type,
        nickname: data.user.nickname,
        accountId: data.user.account_id,
        links: {
          htmlUrl: data.user.links?.html?.href,
        },
      },
      workspace: {
        slug: data.workspace.slug,
        type: data.workspace.type,
        name: data.workspace.name,
        uuid: data.workspace.uuid,
        links: {
          htmlUrl: data.workspace.links?.html?.href,
        },
      },
      links: {
        htmlUrl: data.user.links?.html?.href,
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
}
