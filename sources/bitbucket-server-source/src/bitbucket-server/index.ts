import Client, {Schema} from '@atlassian/bitbucket-server';
import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {
  Commit,
  Project,
  ProjectUser,
  PullRequest,
  PullRequestActivity,
  PullRequestDiff,
  Repository,
} from 'faros-airbyte-common/bitbucket-server';
import {pick} from 'lodash';
import parseDiff from 'parse-diff';
import {AsyncOrSync} from 'ts-essentials';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {
  MoreEndpointMethodsPlugin,
  Prefix as MEP,
} from './more-endpoint-methods';

export interface BitbucketServerConfig extends AirbyteConfig {
  readonly server_url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly token?: string;
  readonly projects?: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<string>;
  readonly page_size?: number;
  readonly cutoff_days?: number;
  readonly reject_unauthorized?: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

type Dict = {[k: string]: any};
type EmitFlags = {shouldEmit: boolean; shouldBreakEarly: boolean};
type ExtendedClient = Client & {
  addPlugin: (plugin: typeof MoreEndpointMethodsPlugin) => void;
  [MEP]: any; // MEP: MoreEndpointsPrefix
};

export class BitbucketServer {
  private static bitbucket: BitbucketServer = null;

  constructor(
    private readonly client: ExtendedClient,
    private readonly pageSize: number,
    private readonly logger: AirbyteLogger,
    readonly startDate: Date
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

    const client = new Client({baseUrl: config.server_url}) as ExtendedClient;
    client.addPlugin(MoreEndpointMethodsPlugin);
    const auth = config.token
      ? {type: 'token', token: config.token}
      : {type: 'basic', username: config.username, password: config.password};
    client.authenticate(auth as Client.Auth);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;

    const bb = new BitbucketServer(client, pageSize, logger, startDate);
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
    if (!config.projects || config.projects.length < 1) {
      return [false, 'No projects provided'];
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    return [true, undefined];
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.api.getUsers({limit: 1});
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
    let {data: page} = await fetch(0);
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
      page = page.nextPageStart ? (await fetch(page.nextPageStart)).data : null;
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
      this.logger.debug(`Fetching commits for repository: ${fullName}`);
      yield* this.paginate<Dict, Commit>(
        (start) =>
          this.client[MEP].repos.getCommits({
            projectKey,
            repositorySlug,
            merges: 'include',
            start,
            since: lastCommitId,
            limit: this.pageSize,
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
      throw new VError(
        innerError(err),
        `Error fetching commits for repository: ${fullName}`
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
        `Fetching pull request activities for repository: ${fullName}`
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
        `Error fetching pull request activities for repository: ${fullName}`
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
        `Fetching pull request diffs for repository: ${fullName}`
      );
      const prs = this.pullRequests(
        projectKey,
        repositorySlug,
        lastPRUpdatedDate
      );
      for (const pr of await prs) {
        const {data} = await this.client[MEP].pullRequests.getDiff({
          projectKey,
          repositorySlug,
          pullRequestId: pr.id,
        });
        try {
          yield {
            files: parseDiff(data).map((f) =>
              pick(f, 'deletions', 'additions', 'from', 'to', 'deleted', 'new')
            ),
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
        } catch (err) {
          this.logger.error(
            `Failed to parse raw diff for repository ${fullName} pull request ${
              pr.id
            }: ${JSON.stringify(err)}`
          );
        }
      }
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching pull request activities for repository: ${fullName}`
      );
    }
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
      this.logger.debug(`Fetching pull requests for repository: ${fullName}`);
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
      throw new VError(
        innerError(err),
        `Error fetching pull requests for repository: ${fullName}`
      );
    }
  }

  @Memoize(
    (projectKey: string, include?: ReadonlyArray<string>) =>
      `${projectKey};${JSON.stringify(include)}`
  )
  async repositories(
    projectKey: string,
    include?: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Repository>> {
    try {
      this.logger.debug(`Fetching repositories for project: ${projectKey}`);
      const results: Repository[] = [];
      const repos = this.paginate<Dict, Repository>(
        (start) =>
          this.client[MEP].projects.getRepositories({
            projectKey,
            start,
            limit: this.pageSize,
          }),
        async (data): Promise<Repository> => {
          const {data: defaultBranch} =
            await this.client.repos.getDefaultBranch({
              projectKey,
              repositorySlug: data.slug,
            });
          return {
            ...data,
            computedProperties: {
              fullName: repoFullName(projectKey, data.slug),
              mainBranch: defaultBranch?.displayId,
            },
          } as Repository;
        },
        (repo) => {
          return {
            shouldEmit:
              !include || include.includes(repo.computedProperties.fullName),
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
        `Error fetching repositories for project: ${projectKey}`
      );
    }
  }

  async project(projectKey: string): Promise<Project> {
    try {
      const {data} = await this.client[MEP].projects.getProject({projectKey});
      return data;
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching project: ${projectKey}`
      );
    }
  }

  async *projectUsers(project: string): AsyncGenerator<ProjectUser> {
    try {
      this.logger.debug(`Fetching users for project: ${project}`);
      yield* this.paginate<Schema.PaginatedUsers, ProjectUser>(
        (start) =>
          this.client.api.getUsers({
            start,
            limit: this.pageSize,
            q: {
              'permission.1': 'PROJECT_READ',
              'permission.1.projectKey': project,
            },
          }),
        (data: Schema.User): ProjectUser => {
          return {
            user: data,
            project: {key: project},
          } as ProjectUser;
        }
      );
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching users for project: ${project}`
      );
    }
  }
}

function repoFullName(projectKey: string, repoSlug: string): string {
  return `${projectKey}/${repoSlug}`;
}

function innerError(err: any): VError {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}
