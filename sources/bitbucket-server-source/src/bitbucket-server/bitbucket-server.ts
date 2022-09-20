import Client, {Schema} from '@atlassian/bitbucket-server';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {AsyncOrSync, Dictionary} from 'ts-essentials';
import VError from 'verror';

import {
  MoreEndpointMethodsPlugin,
  Prefix as MEP,
} from './more-endpoint-methods';
import {
  BitbucketServerConfig,
  Repository,
  Workspace,
  WorkspaceUser,
} from './types';

const DEFAULT_PAGE_SIZE = 100;

type Dict = Dictionary<any>;
type ExtendedClient = Client & {
  addPlugin: (plugin: typeof MoreEndpointMethodsPlugin) => void;
  // MEP: MoreEndpointsPrefix
  [MEP]: any;
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
    const [passed, errorMessage] = BitbucketServer.validateConfig(config);
    if (!passed) {
      logger.error(errorMessage);
      throw new VError(errorMessage);
    }
    const client = new Client({baseUrl: config.server_url}) as ExtendedClient;
    client.addPlugin(MoreEndpointMethodsPlugin);
    client.authenticate(
      config.token
        ? {type: 'token', token: config.token}
        : {type: 'basic', username: config.username, password: config.password}
    );
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    const pageSize = config.page_size ?? DEFAULT_PAGE_SIZE;
    const bb = new BitbucketServer(client, pageSize, logger, startDate);
    BitbucketServer.bitbucket = bb;
    logger.debug('Created Bitbucket Server instance');
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
          'Bitbucket access token or a Bitbucket username and password',
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
    toStreamData: (data: Dict) => AsyncOrSync<U>
  ): AsyncGenerator<U> {
    let {data: page} = await fetch(0);
    if (!page) return;
    const resultIsPage = 'values' in page && Array.isArray(page.values);
    if (!resultIsPage) {
      yield toStreamData(page);
      return;
    }
    do {
      for (const data of page.values) {
        const streamData = await toStreamData(data);
        yield streamData;
      }
      page = page.nextPageStart ? (await fetch(page.nextPageStart)).data : null;
    } while (page);
  }

  async *repositories(projectKey: string): AsyncGenerator<Repository> {
    this.logger.debug(`Fetching repositories for project: ${projectKey}`);
    yield* this.paginate<Dict, Repository>(
      (start) =>
        this.client[MEP].projects.getRepositories({
          projectKey,
          start,
          limit: this.pageSize,
        }),
      async (data: Dict): Promise<Repository> => {
        const {data: defaultBranch} = await this.client.repos.getDefaultBranch({
          projectKey,
          repositorySlug: data.slug,
        });
        return {
          slug: data.slug,
          name: data.name,
          fullName: data.name,
          description: data.description,
          isPrivate: !data.public,
          mainBranch: {name: defaultBranch?.displayId},
          links: {htmlUrl: selfHRef(data.links)},
          workspace: {slug: projectKey},
        };
      }
    );
  }

  async workspace(projectKey: string): Promise<Workspace> {
    try {
      const {data} = await this.client[MEP].projects.getProject({projectKey});
      return {
        slug: data.key,
        name: data.name,
        type: 'workspace',
        links: {htmlUrl: selfHRef(data.links)},
      };
    } catch (err) {
      throw new VError(
        innerError(err),
        `Error fetching project: ${projectKey}`
      );
    }
  }

  async *workspaceUsers(project: string): AsyncGenerator<WorkspaceUser> {
    try {
      this.logger.debug(`Fetching users for project: ${project}`);
      yield* this.paginate<Schema.PaginatedUsers, WorkspaceUser>(
        (start) =>
          this.client.api.getUsers({
            start,
            limit: this.pageSize,
            q: {
              'permission.1': 'PROJECT_READ',
              'permission.1.projectKey': project,
            },
          }),
        (data: Schema.User): WorkspaceUser => {
          return {
            workspace: {slug: project},
            user: {
              accountId: data.slug,
              displayName: data.displayName,
              nickname: data.name,
              links: {htmlUrl: selfHRef(data.links as HRefs)},
              type: 'user',
            },
          };
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

type HRefs = {self?: {href: string}[]};
function selfHRef(links: HRefs): string | undefined {
  return links.self?.find((l) => l.href)?.href;
}

function innerError(err: any): VError {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}
