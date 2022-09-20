import BitbucketServerClient, {Schema} from '@atlassian/bitbucket-server';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {
  MoreEndpointMethodsPlugin,
  Prefix as MEP,
} from './more-endpoint-methods';
import {BitbucketServerConfig, Workspace, WorkspaceUser} from './types';

const DEFAULT_PAGE_SIZE = 100;

// MEP: MoreEndpointsPrefix
type ExtendedClient = BitbucketServerClient & {[MEP]: any};

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
    const client = new BitbucketServerClient({baseUrl: config.server_url});
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    client.addPlugin(MoreEndpointMethodsPlugin);
    client.authenticate(
      config.token
        ? {type: 'token', token: config.token}
        : {type: 'basic', username: config.username, password: config.password}
    );
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    const pageLen = config.page_size ?? DEFAULT_PAGE_SIZE;
    const bb = new BitbucketServer(
      client as ExtendedClient,
      pageLen,
      logger,
      startDate
    );
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

  private async *paginate<T extends {[k: string]: any}, U>(
    func: (start: number) => Promise<BitbucketServerClient.Response<T>>,
    mapToObject: (data: Dictionary<any>) => U
  ): AsyncGenerator<U> {
    let {data} = await func(0);
    if (!data) return undefined;
    const valuesExist = 'values' in data && Array.isArray(data.values);
    if (!valuesExist) {
      yield mapToObject(data);
      return;
    }
    do {
      for (const item of data.values) {
        const object = mapToObject(item);
        yield object;
      }
      if (data.isLastPage || !data.nextPageStart) {
        data = undefined;
      } else {
        data = (await func(data.nextPageStart)).data;
      }
    } while (data);
  }

  async getWorkspace(project: string): Promise<Workspace> {
    try {
      const {data} = await this.client[MEP].projects.getProject({
        projectKey: project,
      });
      return {
        slug: data.key,
        name: data.name,
        type: 'workspace',
        links: {htmlUrl: getSelfHref(data.links)},
      };
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        `Error fetching project: ${project}`
      );
    }
  }

  async *getWorkspaceUsers(project: string): AsyncGenerator<WorkspaceUser> {
    try {
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
        (item: Schema.User): WorkspaceUser => {
          return {
            workspace: {slug: project},
            user: {
              accountId: item.slug,
              displayName: item.displayName,
              nickname: item.name,
              links: {htmlUrl: getSelfHref(item.links as HRefs)},
              type: 'user',
            },
          };
        }
      );
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        `Error fetching users for project: ${project}`
      );
    }
  }
}

type HRefs = {self?: {href: string}[]};
function getSelfHref(links: HRefs): string | undefined {
  return links.self?.find((l) => l.href)?.href;
}

function buildInnerError(err: any): VError {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}
