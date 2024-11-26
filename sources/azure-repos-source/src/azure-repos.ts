import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import axiosRetry, {
  IAxiosRetryConfig,
  isIdempotentRequestError,
} from 'axios-retry';
import {AirbyteLogger, base64Encode, wrapApiError} from 'faros-airbyte-cdk';
import https from 'https';
import isRetryAllowed from 'is-retry-allowed';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import url from 'url';
import {VError} from 'verror';

import {
  Branch,
  BuildResponse,
  CodeCoverageResponse,
  Commit,
  CommitRepository,
  ProjectResponse,
  PullRequestThreadResponse,
  TagCommit,
  User,
  UserResponse,
} from './models';
import {
  BranchResponse,
  CommitResponse,
  PullRequest,
  PullRequestResponse,
  Repository,
  RepositoryResponse,
  Tag,
  TagResponse,
} from './models';

const DEFAULT_API_VERSION = '7.0';
export const DEFAULT_BRANCH_PATTERN = '^main$';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_REQUEST_TIMEOUT = 60000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_API_URL = 'https://dev.azure.com';
const DEFAULT_GRAPH_URL = 'https://vssps.dev.azure.com';

export interface AzureRepoConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly projects?: string[];
  readonly branch_pattern?: string;
  readonly cutoff_days?: number;
  readonly api_version?: string;
  readonly graph_version?: string;
  readonly page_size?: number;
  readonly request_timeout?: number;
  readonly max_retries?: number;
  readonly api_url?: string;
  readonly graph_api_url?: string;
  readonly reject_unauthorized?: boolean;
}

export class AzureRepos {
  private static instance: AzureRepos = null;

  constructor(
    private readonly top: number,
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance,
    private readonly maxRetries: number,
    private readonly logger: AirbyteLogger,
    private projects: string[],
    private readonly cutoffDays: number,
    private readonly branchPattern: RegExp
  ) {}

  static async make(
    config: AzureRepoConfig,
    logger: AirbyteLogger
  ): Promise<AzureRepos> {
    if (AzureRepos.instance) return AzureRepos.instance;

    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }
    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }
    if (config.projects?.length > 1 && config.projects?.includes('*')) {
      throw new VError('Projects provided in addition to * keyword');
    }

    const accessToken = base64Encode(`:${config.access_token}`);

    function makeAgent(baseUrl: string): https.Agent {
      const isHttps = new url.URL(baseUrl).protocol.startsWith('https');
      if (!isHttps) {
        return undefined;
      }
      return new https.Agent({
        rejectUnauthorized: config.reject_unauthorized ?? true,
        timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      });
    }

    const httpClient = axios.create({
      baseURL: `${config.api_url ?? DEFAULT_API_URL}/${config.organization}`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.api_version ?? DEFAULT_API_VERSION},
      headers: {Authorization: `Basic ${accessToken}`},
      httpsAgent: makeAgent(config.api_url ?? DEFAULT_API_URL),
    });
    const graphClient = axios.create({
      baseURL: `${config.graph_api_url ?? DEFAULT_GRAPH_URL}/${
        config.organization
      }/_apis/graph`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.graph_version ?? DEFAULT_GRAPH_VERSION},
      headers: {Authorization: `Basic ${accessToken}`},
      httpsAgent: makeAgent(config.graph_api_url ?? DEFAULT_GRAPH_URL),
    });

    const top = config.page_size ?? DEFAULT_PAGE_SIZE;
    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;

    const isNetworkError = (error): boolean => {
      return (
        !error.response &&
        Boolean(error.code) && // Prevents retrying cancelled requests
        isRetryAllowed(error) // Prevents retrying unsafe errors
      );
    };
    const retryCondition = (error: AxiosError): boolean => {
      return isNetworkError(error) || isIdempotentRequestError(error);
    };

    const retryConfig: IAxiosRetryConfig = {
      retryDelay: axiosRetry.exponentialDelay,
      shouldResetTimeout: true,
      retries: maxRetries,
      retryCondition,
      onRetry(retryCount, error, requestConfig) {
        logger.info(
          `Retrying request ${requestConfig.url} due to an error: ${error.message} ` +
            `(attempt ${retryCount} of ${maxRetries})`
        );
      },
    };

    axiosRetry(httpClient, retryConfig);
    axiosRetry(graphClient, retryConfig);

    const branchPattern = new RegExp(
      config.branch_pattern || DEFAULT_BRANCH_PATTERN
    );

    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;

    AzureRepos.instance = new AzureRepos(
      top,
      httpClient,
      graphClient,
      maxRetries,
      logger,
      config.projects ?? [],
      cutoffDays,
      branchPattern
    );

    await AzureRepos.instance.initializeProjects();

    return AzureRepos.instance;
  }

  private async initializeProjects(): Promise<void> {
    if (!this.projects?.length || this.projects[0] === '*') {
      this.projects = await this.listProjects();
    }

    if (!Array.isArray(this.projects) || !this.projects?.length) {
      throw new VError(
        'Projects were not provided and could not be initialized'
      );
    }

    this.logger.info(
      `Projects that will be synced: [${AzureRepos.instance.projects.join(
        ','
      )}]`
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.getRepositories().next();
      await this.getUsers().next();
    } catch (err: any) {
      throw new VError(err, 'Please verify your access token is correct');
    }
  }

  async *getRepositories(): AsyncGenerator<Repository> {
    for (const project of this.projects) {
      for (const repository of await this.listRepositories(project)) {
        const item = {...repository}; // Don't modify memoized repo
        item.branches = await this.listBranches(project, repository);
        item.tags = await this.listRepositoryTags(project, repository);
        yield item;
      }
    }
  }

  async *getPullRequests(since?: string): AsyncGenerator<PullRequest> {
    const cutoffDate = DateTime.now().minus({days: this.cutoffDays});
    const sinceDate = DateTime.fromISO(since);

    for (const project of this.projects) {
      for (const repository of await this.listRepositories(project)) {
        for (const branch of await this.listBranches(project, repository)) {
          yield* this.listPullRequests(
            project,
            repository,
            branch,
            sinceDate > cutoffDate ? sinceDate : cutoffDate
          );
        }
      }
    }
  }

  async *getCommits(since?: string): AsyncGenerator<Commit> {
    const cutoffDate = DateTime.now().minus({day: this.cutoffDays});
    const sinceDate = DateTime.fromISO(since);

    for (const project of this.projects) {
      for (const repository of await this.listRepositories(project)) {
        const branch = getQueryableDefaultBranch(repository.defaultBranch);
        if (!branch) {
          this.logger.error(
            `No default branch found for repository ${repository.name}. Will not fetch any commits.`
          );
          continue;
        }
        for await (const commit of this.listCommits(
          project,
          repository,
          branch,
          sinceDate > cutoffDate ? sinceDate : cutoffDate
        )) {
          commit.repository = repository as CommitRepository;
          commit.branch = branch;
          yield commit;
        }
      }
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    let continuationToken: string;
    do {
      const res = await this.graphClient.get<UserResponse>('users', {
        params: {subjectTypes: 'msa,aad,imp', continuationToken},
      });
      continuationToken = res.headers?.['X-MS-ContinuationToken'];
      for (const item of res.data?.value ?? []) {
        yield item;
      }
    } while (continuationToken);
  }

  private async listProjects(): Promise<string[]> {
    const projects: string[] = [];
    for await (const projectRes of this.getPaginated<ProjectResponse>(
      '_apis/projects',
      '$top',
      '$skip',
      {},
      this.top
    )) {
      for (const project of projectRes?.data?.value ?? []) {
        projects.push(project.name);
      }
    }
    return projects;
  }

  @Memoize((project: string) => project)
  private async listRepositories(project: string): Promise<Repository[]> {
    const res = await this.get<RepositoryResponse>(
      `${project}/_apis/git/repositories`
    );
    return res?.data?.value ?? [];
  }

  /**
   * List all of the commits for a branch within a given repository and project.
   * If 'since' provided, only commits after the specified date will be returned.
   *
   * @param project The project containing the repository
   * @param repo    The repository containing the branch
   * @param branch  The branch containing the commits
   * @param since   Commits will be ignored before this date
   * @returns       An AsyncGenerator of commits
   */
  private async *listCommits(
    project: string,
    repo: Repository,
    branch: string,
    since?: DateTime
  ): AsyncGenerator<Commit> {
    for await (const commitRes of this.getPaginated<CommitResponse>(
      `${project}/_apis/git/repositories/${repo.id}/commits`,
      'searchCriteria.$top',
      'searchCriteria.$skip',
      {
        'searchCriteria.itemVersion.version': branch,
        'searchCriteria.fromDate': since?.toISO(),
      },
      this.top
    )) {
      for (const commit of commitRes?.data?.value ?? []) {
        yield commit;
      }
    }
  }

  /**
   * Lists all of the branches within a repository. If a branch pattern is provided then
   * only those that match the pattern are returned.
   *
   * @param project The project containing the repository
   * @param repo    The repository containing the branches
   * @returns       The branches
   */
  @Memoize((project: string, repo: Repository) => `${project};${repo.id}`)
  private async listBranches(
    project: string,
    repo: Repository
  ): Promise<Branch[]> {
    const branches = [];
    const branchRes = await this.get<BranchResponse>(
      `${project}/_apis/git/repositories/${repo.id}/stats/branches`
    );
    for (const branch of branchRes?.data?.value ?? []) {
      if (!this.branchPattern.test(branch.name)) {
        this.logger.info(
          `Skipping branch ${branch.name} since it does not match ${this.branchPattern} pattern`
        );
      } else {
        branches.push(branch);
      }
    }
    return branches;
  }

  /**
   * Lists all of a repository's tags.
   *
   * @param project The project containing the repository
   * @param repo    The repository
   * @returns       The repositories tags
   */
  private async listRepositoryTags(
    project: string,
    repo: Repository
  ): Promise<Tag[]> {
    const tagRes = await this.get<TagResponse>(
      `${project}/_apis/git/repositories/${repo.id}/refs`,
      {filter: 'tags', peelTags: 'true'}
    );
    const tags = [];
    for (const tag of tagRes?.data?.value ?? []) {
      // Per docs, annotated tags will populate the peeledObjectId property
      if (tag.peeledObjectId) {
        const tagItem: Tag = tag;
        const tagCommitRes = await this.get<TagCommit>(
          `${project}/_apis/git/repositories/${repo.id}/annotatedtags/${tag.objectId}`
        );
        tagItem.commit = tagCommitRes?.data ?? null;
        tags.push(tagItem);
      }
    }
    return tags;
  }

  /**
   * Lists 'all' of the pull requests within a given project and repository
   * whose target branch is the given branch.
   *
   * @param project         The project whose pull requests should be retrieved
   * @param repo            The repository whose pull requests should be retrieved
   * @param branch          The target branch of pull requests that should be retrieved
   * @param completedSince  The date after which 'completed' pull requests are considered
   * @returns               An AsyncGenerator of pull requests
   */
  private async *listPullRequests(
    project: string,
    repo: Repository,
    branch: Branch,
    since?: DateTime
  ): AsyncGenerator<PullRequest> {
    for await (const pullRequestRes of this.getPaginated<PullRequestResponse>(
      `${project}/_apis/git/repositories/${repo.id}/pullrequests`,
      '$top',
      '$skip',
      {
        'searchCriteria.status': 'all',
        'searchCriteria.targetRefName': `refs/heads/${branch.name}`,
      }
    )) {
      for (const pullRequest of pullRequestRes?.data?.value ?? []) {
        const closedDate = DateTime.fromISO(pullRequest.closedDate);
        if (pullRequest.status === 'completed' && closedDate <= since) {
          continue;
        }

        const threadResponse = await this.get<PullRequestThreadResponse>(
          `${project}/_apis/git/repositories/${repo.id}/pullRequests/${pullRequest.pullRequestId}/threads`
        );
        pullRequest.threads = [];
        const threads = threadResponse?.data?.value ?? [];
        pullRequest.threads.push(...threads);

        // For completed PRs, fetch the associated build and code coverage
        if (pullRequest.status === 'completed') {
          try {
            // Get the latest build for this PR
            const buildRes = await this.get<BuildResponse>(
              `${project}/_apis/build/builds`,
              {
                reasonFilter: 'pullRequest',
                statusFilter: 'completed',
                resultFilter: 'succeeded',
                queryOrder: 'finishTimeDescending',
                pullRequestId: pullRequest.pullRequestId,
                $top: 1,
              }
            );
            const builds = buildRes?.data?.value ?? [];
            if (builds.length > 0) {
              const build = builds[0];

              // Get code coverage for the build
              const coverageRes = await this.get<CodeCoverageResponse>(
                `${project}/_apis/test/codecoverage`,
                {
                  buildId: build.id,
                  flags: 7,
                }
              );
              // Add code coverage data to the PR object
              if (coverageRes?.data?.value?.length > 0) {
                const coverage = coverageRes.data.value[0];
                pullRequest.codeCoverage = coverage.coverageStats.map(
                  (stat) => ({
                    label: stat.label,
                    covered: stat.covered,
                    total: stat.total,
                    percentage:
                      stat.total > 0 ? (stat.covered / stat.total) * 100 : 0,
                  })
                );
              }
            }
          } catch (err) {
            this.logger.warn(
              `Failed to fetch code coverage for PR ${pullRequest.pullRequestId}: ${err}`
            );
          }
        }

        yield pullRequest;
      }
    }
  }

  private get<T = any>(
    path: string,
    params: Dictionary<any> = {}
  ): Promise<AxiosResponse<T> | undefined> {
    return this.getHandleNotFound(path, {params});
  }

  private async *getPaginated<T extends {value: any[]}>(
    path: string,
    topParamName: string,
    skipParamName: string,
    params: Dictionary<any>,
    top: number = this.top
  ): AsyncGenerator<AxiosResponse<T> | undefined> {
    let resCount = 0;
    let skip = 0;
    let res: AxiosResponse<T> | undefined = undefined;
    params[topParamName] = top;

    do {
      params[skipParamName] = skip;
      res = await this.getHandleNotFound(path, {params});
      if (res) yield res;
      resCount = (res?.data?.value ?? []).length;
      skip += resCount;
    } while (resCount >= top);
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // Read more: https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops#api-client-experience
  private async maybeSleepOnResponse<T = any>(
    path: string,
    res?: AxiosResponse<T>
  ): Promise<boolean> {
    const retryAfterSecs = res?.headers?.['retry-after'];
    if (retryAfterSecs) {
      const retryRemaining = res?.headers?.['x-ratelimit-remaining'];
      const retryRatelimit = res?.headers?.['x-ratelimit-limit'];
      this.logger.warn(
        `'Retry-After' response header is detected when requesting ${path}. ` +
          `Waiting for ${retryAfterSecs} seconds before making any requests. ` +
          `(TSTUs remaining: ${retryRemaining}, TSTUs total limit: ${retryRatelimit})`
      );
      await this.sleep(Number.parseInt(retryAfterSecs) * 1000);
      return true;
    }
    return false;
  }

  private async getHandleNotFound<T = any, D = any>(
    path: string,
    conf?: AxiosRequestConfig<D>,
    attempt = 1
  ): Promise<AxiosResponse<T> | undefined> {
    try {
      const res = await this.httpClient.get<T, AxiosResponse<T>>(path, conf);
      await this.maybeSleepOnResponse(path, res);
      return res;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt <= this.maxRetries) {
        this.logger.warn(
          `Request to ${path} was rate limited. Retrying... ` +
            `(attempt ${attempt} of ${this.maxRetries})`
        );
        await this.maybeSleepOnResponse(path, err?.response);
        return await this.getHandleNotFound(path, conf, attempt + 1);
      }
      if (err?.response?.status === 404) {
        return undefined;
      }
      throw wrapApiError(err, `Failed to get ${path}. `);
    }
  }
}

function getQueryableDefaultBranch(
  defaultBranch?: string,
  prefixToRemove = 'refs/heads/'
): string | undefined {
  if (!defaultBranch) {
    return undefined;
  }
  if (defaultBranch.startsWith(prefixToRemove)) {
    return defaultBranch.slice(prefixToRemove.length);
  }
  return defaultBranch;
}
