import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';
import {wrapApiError} from 'faros-airbyte-cdk';
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

export interface AzureRepoConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
  readonly graph_version?: string;
  readonly page_size?: number;
  readonly max_commits_per_branch?: number;
}

export class AzureRepo {
  private static azureRepo: AzureRepo = null;

  constructor(
    private readonly top: number,
    private readonly maxCommitsPerBranch: number,
    private readonly httpClient: AxiosInstance,
    private readonly graphClient: AxiosInstance
  ) {}

  static async instance(config: AzureRepoConfig): Promise<AzureRepo> {
    if (AzureRepo.azureRepo) return AzureRepo.azureRepo;

    if (!config.access_token) {
      throw new VError('access_token must not be an empty string');
    }
    if (!config.organization) {
      throw new VError('organization must not be an empty string');
    }
    if (!config.project) {
      throw new VError('project must not be an empty string');
    }

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
      timeout: 15000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });
    const graphVersion = config.graph_version ?? DEFAULT_GRAPH_VERSION;
    const graphClient = axios.create({
      baseURL: `https://vssps.dev.azure.com/${config.organization}/_apis/graph`,
      timeout: 15000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': graphVersion,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });

    const top = config.page_size ?? DEFAULT_PAGE_SIZE;
    const maxCommitsPerBranch =
      config.max_commits_per_branch ?? DEFAULT_MAX_COMMITS_PER_BRANCH;

    AzureRepo.azureRepo = new AzureRepo(
      top,
      maxCommitsPerBranch,
      httpClient,
      graphClient
    );
    return AzureRepo.azureRepo;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getRepositories();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  private get<T = any, R = AxiosResponse<T>>(
    path: string,
    params: Dictionary<any> = {}
  ): Promise<R | undefined> {
    return this.getHandleNotFound(path, {params});
  }

  private async getAll<T = any, R = AxiosResponse<T>>(
    path: string,
    topParamName: string,
    skipParamName: string,
    params: Dictionary<any> = {},
    top: number = this.top,
    maxTotal = Infinity
  ): Promise<ReadonlyArray<R>> {
    const res = [];
    for await (const item of this.getGenerator(
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

  private async *getGenerator<T = any>(
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
      try {
        resCount = res?.data?.['value'].length;
        skip += resCount;
        // eslint-disable-next-line no-empty
      } catch (err) {}
    } while (resCount >= top && skip < maxTotal);
  }

  private async getHandleNotFound<T = any, R = AxiosResponse<T>, D = any>(
    path: string,
    conf?: AxiosRequestConfig<D>
  ): Promise<R | undefined> {
    try {
      const res = this.httpClient.get<T, R>(path, conf);
      return res;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return undefined;
      }
      throw wrapApiError(err, `Failed to get ${path}`);
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
