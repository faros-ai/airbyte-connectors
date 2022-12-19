import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';
import axiosRetry, {
  IAxiosRetryConfig,
  isIdempotentRequestError,
} from 'axios-retry';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import isRetryAllowed from 'is-retry-allowed';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  CommitChangeCountsResponse,
  PullRequestThreadResponse,
  TagCommit,
  User,
  UserResponse,
} from './models';
import {
  BranchResponse,
  CommitResponse,
  PullRequest,
  PullRequestCommitResponse,
  PullRequestResponse,
  Repository,
  RepositoryResponse,
  Tag,
  TagResponse,
} from './models';

const DEFAULT_API_VERSION = '7.0';
const DEFAULT_GRAPH_VERSION = '7.1-preview.1';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_MAX_COMMITS_PER_BRANCH = 1000;
export const DEFAULT_REQUEST_TIMEOUT = 60000;
export const DEFAULT_MAX_RETRIES = 3;

export interface AzureRepoConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
  readonly graph_version?: string;
  readonly page_size?: number;
  readonly max_commits_per_branch?: number;
  readonly branch_pattern?: string;
  readonly request_timeout?: number;
  readonly max_retries?: number;
}

export class AzureRepos {
  private static instance: AzureRepos = null;

  constructor(
    private readonly top: number,
    private readonly maxCommitsPerBranch: number,
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance,
    private readonly maxRetries: number,
    private readonly logger: AirbyteLogger,
    private readonly branchPattern?: RegExp
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
    if (!config.project) {
      throw new VError('project must not be an empty string');
    }

    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.api_version ?? DEFAULT_API_VERSION},
      headers: {Authorization: `Basic ${config.access_token}`},
    });
    const graphClient = axios.create({
      baseURL: `https://vssps.dev.azure.com/${config.organization}/_apis/graph`,
      timeout: config.request_timeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      params: {'api-version': config.graph_version ?? DEFAULT_GRAPH_VERSION},
      headers: {Authorization: `Basic ${config.access_token}`},
    });

    const top = config.page_size ?? DEFAULT_PAGE_SIZE;
    const maxCommitsPerBranch =
      config.max_commits_per_branch ?? DEFAULT_MAX_COMMITS_PER_BRANCH;

    const maxRetries = config.max_retries ?? DEFAULT_MAX_RETRIES;

    const isNetworkError = (error): boolean => {
      return (
        !error.response &&
        Boolean(error.code) && // Prevents retrying cancelled requests
        isRetryAllowed(error) // Prevents retrying unsafe errors
      );
    };
    const retryCondition = (error: Error): boolean => {
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

    const branchPattern = config.branch_pattern
      ? new RegExp(config.branch_pattern)
      : undefined;

    AzureRepos.instance = new AzureRepos(
      top,
      maxCommitsPerBranch,
      httpClient,
      graphClient,
      maxRetries,
      logger,
      branchPattern
    );
    return AzureRepos.instance;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getRepositories();
      await iter.next();
    } catch (err: any) {
      throw new VError(err, 'Please verify your access token is correct');
    }
  }

  private get<T = any>(
    path: string,
    params: Dictionary<any> = {}
  ): Promise<AxiosResponse<T> | undefined> {
    return this.getHandleNotFound(path, {params});
  }

  private async getAll<T extends {value: any[]}>(
    path: string,
    topParamName: string,
    skipParamName: string,
    params: Dictionary<any> = {},
    top: number = this.top,
    maxTotal = Infinity
  ): Promise<ReadonlyArray<AxiosResponse<T>>> {
    const res = [];
    for await (const item of this.getPaginated(
      path,
      topParamName,
      skipParamName,
      params,
      top,
      maxTotal
    )) {
      if (item) res.push(item);
    }
    return res;
  }

  private async *getPaginated<T extends {value: any[]}>(
    path: string,
    topParamName: string,
    skipParamName: string,
    params: Dictionary<any>,
    top: number,
    maxTotal: number
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
    } while (resCount >= top && skip <= maxTotal);
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

  async *getRepositories(): AsyncGenerator<Repository> {
    const res = await this.get<RepositoryResponse>('git/repositories');
    for (const item of res?.data?.value ?? []) {
      const branchResponse = await this.get<BranchResponse>(
        `git/repositories/${item.id}/stats/branches`
      );
      item.branches = [];
      if (branchResponse?.status === 200) {
        for (const branch of branchResponse?.data?.value ?? []) {
          if (this.branchPattern && !this.branchPattern.test(branch.name)) {
            this.logger.info(
              `Skipping branch ${branch.name} since it does not match ${this.branchPattern} pattern`
            );
            continue;
          }
          item.branches.push(branch);
          branch.commits = [];
          // TODO: commits should be yielded in its own stream instead
          for (const commitResponse of await this.getAll<CommitResponse>(
            `git/repositories/${item.id}/commits`,
            'searchCriteria.$top',
            'searchCriteria.$skip',
            {'searchCriteria.itemVersion.version': branch.name},
            this.top,
            this.maxCommitsPerBranch
          )) {
            const commits = commitResponse?.data?.value ?? [];
            branch.commits.push(...commits);
          }
        }
      }
      const tagsResponse = await this.get<TagResponse>(
        `git/repositories/${item.id}/refs`,
        {filter: 'tags'}
      );
      item.tags = [];
      if (tagsResponse?.status === 200) {
        for (const tag of tagsResponse?.data?.value ?? []) {
          const tagItem: Tag = tag;
          const commitResponse = await this.get<TagCommit>(
            `git/repositories/${item.id}/annotatedtags/${tag.objectId}`
          );
          tagItem.commit = commitResponse?.data ?? null;
          item.tags.push(tagItem);
        }
      }
      yield item;
    }
  }

  async *getPullRequests(): AsyncGenerator<PullRequest> {
    for await (const res of await this.getAll<PullRequestResponse>(
      'git/pullrequests',
      '$top',
      '$skip',
      {'searchCriteria.status': 'all'}
    )) {
      for (const item of res?.data?.value ?? []) {
        const commitResponse = await this.get<PullRequestCommitResponse>(
          `git/repositories/${item.repository.id}/pullRequests/${item.pullRequestId}/commits`
        );
        item.commits = [];
        if (commitResponse?.status === 200) {
          for (const commit of commitResponse?.data?.value ?? []) {
            const commitChangeCountsResponse =
              await this.get<CommitChangeCountsResponse>(
                `git/repositories/${item.repository.id}/commits/${commit.commitId}/changes`
              );
            commit.changeCounts =
              commitChangeCountsResponse?.data?.changeCounts ?? null;
            item.commits.push(commit);
          }
        }
        const threadResponse = await this.get<PullRequestThreadResponse>(
          `git/repositories/${item.repository.id}/pullRequests/${item.pullRequestId}/threads`
        );
        item.threads = [];
        if (threadResponse?.status === 200) {
          const threads = threadResponse?.data?.value ?? [];
          item.threads.push(...threads);
        }
        yield item;
      }
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.graphClient.get<UserResponse>('users');
    for (const item of res.data?.value ?? []) {
      yield item;
    }
  }
}
