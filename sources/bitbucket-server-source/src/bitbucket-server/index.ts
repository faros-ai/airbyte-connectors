import Client, {ResponseError, Schema} from '@atlassian/bitbucket-server';
import axios, {AxiosInstance} from 'axios';
import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  Commit,
  Project,
  ProjectUser,
  PullRequest,
  PullRequestActivity,
  PullRequestDiff,
  Repository,
  Tag,
  User,
} from 'faros-airbyte-common/bitbucket-server';
import {bucket} from 'faros-airbyte-common/common';
import {pick} from 'lodash';
import parseDiff from 'parse-diff';
import {createInterface} from 'readline';
import {Readable} from 'stream';
import {AsyncOrSync} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {
  MoreEndpointMethodsPlugin,
  Prefix as MEP,
} from './more-endpoint-methods';
import {ProjectRepoFilter} from './project-repo-filter';

export interface BitbucketServerConfig extends AirbyteConfig {
  readonly server_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly projects?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly cutoff_days?: number;
  readonly max_retries?: number;
  readonly reject_unauthorized?: boolean;
  readonly repo_bucket_id?: number;
  readonly repo_bucket_total?: number;
}

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 25;

type Dict = {[k: string]: any};
type EmitFlags = {shouldEmit: boolean; shouldBreakEarly: boolean};
type ExtendedClient = Client & {
  addPlugin: (plugin: typeof MoreEndpointMethodsPlugin) => void;
  [MEP]: any; // MEP: MoreEndpointsPrefix
};

interface PaginatedProjects extends Dict {
  isLastPage?: boolean;
  limit?: number;
  size?: number;
  start?: number;
  values?: Project[];
  [k: string]: any;
}

type RetryOptions = {
  retries?: number;
  delay?: number;
  factor?: number;
  shouldRetry?: (err: unknown) => boolean;
};

export class BitbucketServer {
  private static bitbucket: BitbucketServer = null;

  constructor(
    private readonly client: ExtendedClient,
    private readonly streamableClient: AxiosInstance,
    private readonly pageSize: number,
    private readonly maxRetries: number,
    private readonly logger: AirbyteLogger,
    private readonly startDate: Date,
    private readonly repoBucketId: number,
    private readonly repoBucketTotal: number
  ) {}

  static instance(
    config: BitbucketServerConfig,
    logger: AirbyteLogger
  ): BitbucketServer {
    if (BitbucketServer.bitbucket) return BitbucketServer.bitbucket;

    if (config?.reject_unauthorized === false) {
      logger.warn('Disabling certificate validation');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    const [passed, errorMessage] = BitbucketServer.validateConfig(config);
    if (!passed) {
      logger.error(errorMessage);
      throw new VError(errorMessage);
    }

    const baseUrl = config.server_url.endsWith('/')
      ? config.server_url.replace(/\/$/, '')
      : config.server_url;
    const client = new Client({baseUrl}) as ExtendedClient;
    client.addPlugin(MoreEndpointMethodsPlugin);
    const auth = config.token
      ? {type: 'token', token: config.token}
      : {type: 'basic', username: config.username, password: config.password};
    client.authenticate(auth as Client.Auth);
    const startDate = new Date();
    startDate.setDate(
      startDate.getDate() - (config.cutoff_days ?? DEFAULT_CUTOFF_DAYS)
    );
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const streamableClient = axios.create({
      responseType: 'stream',
      baseURL: baseUrl,
      maxContentLength: Infinity, //default is 2000 bytes
      headers: {
        Authorization: config.token
          ? 'Bearer ' + config.token
          : 'Basic ' +
            Buffer.from(`${config.username}:${config.password}`).toString(
              'base64'
            ),
      },
    });
    const bb = new BitbucketServer(
      client,
      streamableClient,
      pageSize,
      config.max_retries ?? 5,
      logger,
      startDate,
      config.repo_bucket_id ?? 1,
      config.repo_bucket_total ?? 1
    );
    BitbucketServer.bitbucket = bb;
    logger.debug(`Created Bitbucket Server instance with ${auth.type} auth`);
    return BitbucketServer.bitbucket;
  }

  private static validateConfig(
    config: BitbucketServerConfig
  ): [boolean, string] {
    const existToken = config.token && !config.username && !config.password;
    const existAuth = !config.token && config.username && config.password;
    try {
      new URL(config.server_url);
    } catch (error) {
      return [false, 'server_url must be a valid url'];
    }
    if (!existToken && !existAuth) {
      return [
        false,
        'Invalid authentication details. Please provide either a ' +
          'Bitbucket access token OR a Bitbucket username and password',
      ];
    }
    const repoBucketTotal = config.repo_bucket_total ?? 1;
    if (repoBucketTotal < 1) {
      return [false, 'repo_bucket_total must be a positive integer'];
    }
    const repoBucketId = config.repo_bucket_id ?? 1;
    if (repoBucketId < 1 || repoBucketId > repoBucketTotal) {
      return [false, `repo_bucket_id must be between 1 and ${repoBucketTotal}`];
    }
    return [true, undefined];
  }

  async checkConnection(): Promise<void> {
    try {
      await this.retry(() => this.client.api.getUsers({limit: 1}));
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

  private async *paginate<T extends Dict, U>(
    fetch: (start: number) => Promise<Client.Response<T>>,
    toStreamData: (data: Dict) => AsyncOrSync<U>,
    shouldEmit: (streamData: U) => AsyncOrSync<EmitFlags> = (): EmitFlags => {
      return {shouldEmit: true, shouldBreakEarly: false};
    }
  ): AsyncGenerator<U> {
    let {data: page} = await this.retry(() => fetch(0));
    if (!page) return;
    if (!Array.isArray(page.values)) {
      yield toStreamData(page);
      return;
    }
    do {
      for (const data of page.values) {
        const streamData = await toStreamData(data);
        const flags = await shouldEmit(streamData);
        if (flags.shouldEmit) {
          yield streamData;
        } else if (flags.shouldBreakEarly) {
          return;
        }
      }
      page = page.nextPageStart
        ? (await this.retry(() => fetch(page.nextPageStart))).data
        : null;
    } while (page);
  }

  async *commits(
    projectKey: string,
    repositorySlug: string,
    lastCommitId?: string
  ): AsyncGenerator<Commit> {
    const fullName = repoFullName(projectKey, repositorySlug);
    const startDateMs = this.startDate.getTime();
    try {
      this.logger.debug(`Fetching commits for repository ${fullName}`);
      yield* this.paginate<Dict, Commit>(
        (start) =>
          this.client[MEP].repos.getCommits({
            projectKey,
            repositorySlug,
            merges: 'include',
            start,
            since: lastCommitId,
            limit: this.pageSize,
            ignoreMissing: true,
          } as Client.Params.ReposGetCommits),
        (data) => {
          return {
            ...data,
            computedProperties: {repository: {fullName}},
          } as Commit;
        },
        (commit) => {
          return {
            shouldEmit:
              !!lastCommitId || commit.committerTimestamp > startDateMs,
            shouldBreakEarly: !lastCommitId,
          };
        }
      );
    } catch (err) {
      const innerErr = innerError(err);
      if (innerErr.message === 'No default branch is defined') {
        this.logger.warn(
          `No default branch is defined for repository ${fullName}. Please set one to enable fetching commits.`
        );
      } else {
        throw new VError(
          innerErr,
          `Error fetching commits for repository ${fullName}`
        );
      }
    }
  }

  async *tags(projectKey: string, repositorySlug: string): AsyncGenerator<Tag> {
    const fullName = repoFullName(projectKey, repositorySlug);
    try {
      this.logger.debug(`Fetching tags for repository ${fullName}`);
      yield* this.paginate<Dict, Tag>(
        (start) =>
          this.client[MEP].repos.getTags({
            projectKey,
            repositorySlug,
            start,
            limit: this.pageSize,
          }),
        (data) => {
          return {
            ...data,
            computedProperties: {repository: {fullName}},
          } as Tag;
        }
      );
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching tags for repository ${fullName}`
      );
    }
  }

  async *pullRequestActivities(
    projectKey: string,
    repositorySlug: string,
    lastPRUpdatedDate = this.startDate.getTime()
  ): AsyncGenerator<PullRequestActivity> {
    const fullName = repoFullName(projectKey, repositorySlug);
    try {
      this.logger.debug(
        `Fetching pull request activities for repository ${fullName}`
      );
      const prs = this.pullRequests(
        projectKey,
        repositorySlug,
        lastPRUpdatedDate
      );
      for (const pr of await prs) {
        yield* this.paginate<Dict, PullRequestActivity>(
          (start) =>
            this.client.pullRequests.getActivities({
              projectKey,
              repositorySlug,
              pullRequestId: pr.id,
              start,
              limit: this.pageSize,
            }),
          (data) => {
            return {
              ...data,
              computedProperties: {
                pullRequest: {
                  id: pr.id,
                  repository: {
                    fullName: pr.computedProperties.repository.fullName,
                  },
                  updatedDate: pr.updatedDate,
                },
              },
            } as PullRequestActivity;
          },
          (activity) => {
            return {
              shouldEmit: activity.createdDate > lastPRUpdatedDate,
              shouldBreakEarly: false,
            };
          }
        );
      }
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching pull request activities for repository ${fullName}`
      );
    }
  }

  async *pullRequestDiffs(
    projectKey: string,
    repositorySlug: string,
    lastPRUpdatedDate = this.startDate.getTime()
  ): AsyncGenerator<PullRequestDiff> {
    const fullName = repoFullName(projectKey, repositorySlug);
    try {
      this.logger.debug(
        `Fetching pull request diffs for repository ${fullName}`
      );
      const prs = this.pullRequests(
        projectKey,
        repositorySlug,
        lastPRUpdatedDate
      );
      for (const pr of await prs) {
        try {
          const response = await this.retry(() =>
            this.streamableClient.get<Readable>(
              `projects/${projectKey}/repos/${repositorySlug}/pull-requests/${pr.id}.diff`
            )
          );

          const files = await this.parseRawDiff(response.data);

          yield {
            files,
            computedProperties: {
              pullRequest: {
                id: pr.id,
                repository: {
                  fullName: pr.computedProperties.repository.fullName,
                },
                updatedDate: pr.updatedDate,
              },
            },
          };
        } catch (err: any) {
          this.logger.error(
            `Failed to parse raw diff for repository ${fullName} pull request ${
              pr.id
            }: ${JSON.stringify(err)}`,
            err.stack
          );
        }
      }
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching pull request activities for repository ${fullName}`
      );
    }
  }

  // Read and parse raw diff stream into a list of files with additions, deletions, from, to, deleted, and new
  private async parseRawDiff(
    data: Readable
  ): Promise<ReadonlyArray<PullRequestDiff['files'][0]>> {
    const lineReader = createInterface({
      input: data,
      crlfDelay: Infinity,
    });
    const files = [];
    let currentFile: string | null = null;

    const parseAndPushDiff = (): void => {
      const fileDiff = parseDiff(currentFile)[0];
      files.push(
        pick(fileDiff, 'deletions', 'additions', 'from', 'to', 'deleted', 'new')
      );
    };

    // read and parse each line accumulating a complete file diff
    for await (const line of lineReader) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          parseAndPushDiff();
          currentFile = null;
        }
        currentFile = line;
      } else {
        currentFile += `\n${line}`;
      }
    }

    // process the last file diff
    if (currentFile) {
      parseAndPushDiff();
    }
    return files;
  }

  @Memoize(
    (projectKey: string, repositorySlug: string, lastUpdatedDate?: number) =>
      `${projectKey};${repositorySlug};${lastUpdatedDate}`
  )
  async pullRequests(
    projectKey: string,
    repositorySlug: string,
    lastUpdatedDate = this.startDate.getTime()
  ): Promise<ReadonlyArray<PullRequest>> {
    const fullName = repoFullName(projectKey, repositorySlug);
    try {
      this.logger.debug(`Fetching pull requests for repository ${fullName}`);
      const results: PullRequest[] = [];
      const prs = this.paginate<Dict, PullRequest>(
        (start) =>
          this.client.repos.getPullRequests({
            projectKey,
            repositorySlug,
            order: 'NEWEST',
            direction: 'INCOMING',
            state: 'ALL',
            start,
            limit: this.pageSize,
          }),
        (data) => {
          return {
            ...data,
            computedProperties: {repository: {fullName}},
          } as PullRequest;
        },
        (pr) => {
          return {
            shouldEmit: pr.updatedDate > lastUpdatedDate,
            shouldBreakEarly: true,
          };
        }
      );
      for await (const pr of prs) {
        results.push(pr);
      }
      return results;
    } catch (err) {
      const innerErr = innerError(err);
      if (innerErr.message === 'No default branch is defined') {
        this.logger.warn(
          `No default branch is defined for repository ${fullName}. Please set one to enable fetching pull requests.`
        );
      } else {
        throw new VError(
          innerErr,
          `Error fetching pull requests for repository ${fullName}`
        );
      }
    }
  }

  @Memoize(
    (projectKey: string, include?: ReadonlyArray<string>) =>
      `${projectKey};${JSON.stringify(include)}`
  )
  async repositories(
    projectKey: string,
    projectRepoFilter?: ProjectRepoFilter
  ): Promise<ReadonlyArray<Repository>> {
    try {
      this.logger.debug(`Fetching repositories for project ${projectKey}`);
      const results: Repository[] = [];
      const repos = this.paginate<Dict, Repository>(
        (start) =>
          this.client[MEP].projects.getRepositories({
            projectKey,
            start,
            limit: this.pageSize,
          }),
        async (data): Promise<Repository> => {
          const fullName = repoFullName(projectKey, data.slug);
          let mainBranch: string = undefined;
          try {
            const {data: defaultBranch} = await this.retry(() =>
              this.client.repos.getDefaultBranch({
                projectKey,
                repositorySlug: data.slug,
              })
            );
            mainBranch = defaultBranch?.displayId;
          } catch (err) {
            this.logger.warn(
              `Received invalid default branch response for repository ${fullName}: ${
                innerError(err).message
              }`
            );
          }
          return {
            ...data,
            computedProperties: {fullName, mainBranch},
          } as Repository;
        },
        (repo) => {
          const repoFullName = repo.computedProperties.fullName;
          return {
            shouldEmit:
              (!projectRepoFilter ||
                projectRepoFilter.isIncluded(repoFullName)) &&
              bucket(
                'farosai/airbyte-bitbucket-server-source',
                repoFullName,
                this.repoBucketTotal
              ) === this.repoBucketId,
            shouldBreakEarly: false,
          };
        }
      );
      for await (const repo of repos) {
        results.push(repo);
      }
      return results;
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching repositories for project ${projectKey}`
      );
    }
  }

  @Memoize()
  async project(projectKey: string): Promise<Project> {
    try {
      const {data} = await this.retry<Dict>(() =>
        this.client[MEP].projects.getProject({projectKey})
      );
      return data;
    } catch (err) {
      throw new VError(innerError(err), `Error fetching project ${projectKey}`);
    }
  }

  @Memoize((projects?: ReadonlyArray<string>) => JSON.stringify(projects || []))
  async projects(
    projects?: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Project>> {
    const lowercaseProjectKeys = projects?.map((p) => p.toLowerCase());
    try {
      this.logger.debug(`Fetching projects`);
      const results = [];
      const iterator = this.paginate<PaginatedProjects, Project>(
        (start) =>
          this.client[MEP].projects.getProjects({
            start,
            limit: this.pageSize,
          }),
        (data): Project => {
          return data as Project;
        },
        (project) => {
          return {
            shouldEmit:
              !projects ||
              projects.length === 0 ||
              lowercaseProjectKeys.includes(project.key?.toLowerCase()),
            shouldBreakEarly: false,
          };
        }
      );
      for await (const project of iterator) {
        results.push(project);
      }
      return results;
    } catch (err) {
      throw new VError(innerError(err), `Error fetching projects`);
    }
  }

  async *projectUsers(projectKey: string): AsyncGenerator<ProjectUser> {
    try {
      this.logger.debug(`Fetching users for project ${projectKey}`);
      yield* this.paginate<Schema.PaginatedUsers, ProjectUser>(
        (start) =>
          this.client[MEP].projects.getUsers({
            start,
            limit: this.pageSize,
            projectKey,
          }),
        (data: Schema.User): ProjectUser => {
          return {user: data.user, project: {key: projectKey}} as ProjectUser;
        }
      );
    } catch (err) {
      if ((err as ResponseError).code === 401) {
        this.logger.warn(
          `Received 401 code fetching users for project ${projectKey}, falling back to global search`
        );
        yield* this.searchUsersByProject(projectKey);
      } else {
        throw new VError(
          innerError(err),
          `Error fetching users for project ${projectKey}`
        );
      }
    }
  }

  private async *searchUsersByProject(
    projectKey: string
  ): AsyncGenerator<ProjectUser> {
    try {
      this.logger.debug(`Searching users by project ${projectKey}`);
      yield* this.paginate<Schema.PaginatedUsers, ProjectUser>(
        (start) =>
          this.client.api.getUsers({
            start,
            limit: this.pageSize,
            q: {
              'permission.1': 'PROJECT_READ',
              'permission.1.projectKey': projectKey,
            },
          }),
        (data: Schema.User): ProjectUser => {
          return {user: data, project: {key: projectKey}} as ProjectUser;
        }
      );
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error searching for users by project ${projectKey}`
      );
    }
  }

  async *users(): AsyncGenerator<User> {
    try {
      this.logger.debug(`Fetching users`);
      yield* this.paginate<Schema.PaginatedUsers, User>(
        (start) =>
          this.client.api.getUsers({
            start,
            limit: this.pageSize,
          }),
        (data) => {
          return data as User;
        }
      );
    } catch (err) {
      throw new VError(innerError(err), `Error fetching users`);
    }
  }

  async retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const {
      retries = this.maxRetries,
      delay = 1,
      factor = 2,
      shouldRetry = (err: any) => err?.code === 429,
    } = options;

    let attempt = 0;
    let currentDelay = delay;

    while (attempt < retries) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (!shouldRetry(err)) {
          throw err;
        } else if (attempt >= retries) {
          this.logger.error(
            `Exceeded maximum rate-limit retries after ${retries} attempts`
          );
          throw err;
        }
        this.logger.warn(
          `Received rate limit error, retrying after ${currentDelay}s`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, currentDelay * 1000)
        );
        currentDelay *= factor;
      }
    }

    throw new VError('Retry function exited unexpectedly');
  }
}

function repoFullName(projectKey: string, repoSlug: string): string {
  return `${projectKey}/${repoSlug}`.toLowerCase();
}

function innerError(err: any): VError {
  const {code, message, error, status} = err;
  const info = {code, status, error: error?.error?.message};
  return new VError({info}, message || JSON.stringify(filterEmptyValues(info)));
}

function filterEmptyValues(obj: any): any {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([_, v]) => v !== undefined && v !== null && v !== ''
    )
  );
}
