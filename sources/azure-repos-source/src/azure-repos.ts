import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {
  CommitChangeCountsResponse,
  PullRequestCommit,
  PullRequestThreadResponse,
  TagCommit,
  User,
  UserResponse,
} from './models';
import {
  Branch,
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

const DEFAULT_API_VERSION = '6.0';
const DEFAULT_GRAPH_VERSION = '4.1-preview.1';

export interface AzureRepoConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
  readonly graph_version?: string;
}

export class AzureRepo {
  private static azureRepo: AzureRepo = null;

  constructor(
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

    AzureRepo.azureRepo = new AzureRepo(httpClient, graphClient);
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
    path: string
  ): Promise<R | undefined> {
    return this.handleNotFound<T, R>(() => this.httpClient.get<T, R>(path));
  }

  private async handleNotFound<T = any, R = AxiosResponse<T>>(
    call: () => Promise<R>
  ): Promise<R | undefined> {
    try {
      const res = await call();
      return res;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return undefined;
      }
      throw err;
    }
  }

  async *getRepositories(): AsyncGenerator<Repository> {
    const res = await this.get<RepositoryResponse>('git/repositories');
    for (const item of res?.data?.value ?? []) {
      const branchResponse = await this.get<BranchResponse>(
        `git/repositories/${item.id}/stats/branches`
      );
      const branches: Branch[] = [];
      for (const branch of branchResponse?.data?.value ?? []) {
        const branchItem: Branch = branch;
        const commitResponse = await this.get<CommitResponse>(
          `git/repositories/${item.id}/commits?searchCriteria.itemVersion.version=${branch.name}`
        );
        branchItem.commits = commitResponse?.data?.value ?? [];
        branches.push(branchItem);
      }
      item.branches = branches;
      const tagsResponse = await this.get<TagResponse>(
        `git/repositories/${item.id}/refs?filter=tags`
      );
      const tags: Tag[] = [];
      for (const tag of tagsResponse?.data?.value ?? []) {
        const tagItem: Tag = tag;
        const commitResponse = await this.get<TagCommit>(
          `git/repositories/${item.id}/annotatedtags/${tag.objectId}`
        );
        tagItem.commit = commitResponse?.data ?? null;
        tags.push(tagItem);
      }
      item.tags = tags;
      yield item;
    }
  }

  async *getPullRequests(): AsyncGenerator<PullRequest> {
    const res = await this.get<PullRequestResponse>(
      'git/pullrequests?searchCriteria.status=all'
    );
    for (const item of res.data.value) {
      const commitResponse = await this.get<PullRequestCommitResponse>(
        `git/repositories/${item.repository.id}/pullRequests/${item.pullRequestId}/commits`
      );
      const commits: PullRequestCommit[] = [];

      for (const commit of commitResponse?.data?.value ?? []) {
        const commitChangeCountsResponse =
          await this.get<CommitChangeCountsResponse>(
            `git/repositories/${item.repository.id}/commits/${commit.commitId}/changes`
          );
        commit.changeCounts =
          commitChangeCountsResponse?.data?.changeCounts ?? null;
        commits.push(commit);
      }
      item.commits = commits;
      const threadResponse = await this.get<PullRequestThreadResponse>(
        `git/repositories/${item.repository.id}/pullRequests/${item.pullRequestId}/threads`
      );
      item.threads = threadResponse?.data?.value ?? [];
      yield item;
    }
  }

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.graphClient.get<UserResponse>('users');
    for (const item of res.data?.value ?? []) {
      yield item;
    }
  }
}
