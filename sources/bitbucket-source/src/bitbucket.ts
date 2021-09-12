import {Bitbucket} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import Bottleneck from 'bottleneck';
import {AirbyteConfig} from 'faros-airbyte-cdk';
import {VError} from 'verror';

export interface BitbucketConfig extends AirbyteConfig {
  readonly workspace?: ReadonlyArray<string>;
  readonly repoList?: ReadonlyArray<string>;
  readonly username: string;
  readonly password: string;
  readonly token: string;
  readonly pageSize: number;
}

export interface Workspace {
  createdOn: string;
  htmlUrl: string;
  name: string;
  slug: string;
  type: string;
  uuid: string;
}

export async function createClient(
  config: AirbyteConfig
): Promise<[BitbucketClient, string]> {
  const [passed, errorMessage] = isValidateConfig(config);
  if (!passed) {
    return [undefined, errorMessage];
  }

  const auth = config.token
    ? {token: config.token}
    : {username: config.username, password: config.password};

  try {
    const client = Bitbucket({baseUrl: config.service_url, auth});
    await client.users.getAuthedUser({});
    return [new BitbucketClient(client), null];
  } catch (error) {
    return [undefined, 'Invalid credentials provided'];
  }
}

function isValidateConfig(config: AirbyteConfig): [boolean, string] {
  if (
    (config.token && config.username && config.password) ||
    (config.token && (config.username || config.password)) ||
    (!config.token && (!config.username || !config.password))
  ) {
    return [
      false,
      'Invalid authentication details. Please provide either only the ' +
        'Bitbucket access token or Bitbucket username and password',
    ];
  }

  if (!config.workspace) {
    return [false, 'No workspace provided'];
  }

  try {
    new URL(config.server_url);
  } catch (error) {
    return [false, 'server_url: must be a valid url'];
  }

  return [true, undefined];
}

function buildInnerError(err: any): Error {
  const {message, error, status} = err;
  return new VError({info: {status, error: error?.error?.message}}, message);
}

export const DEFAULT_LIMITER = new Bottleneck({maxConcurrent: 5, minTime: 100});

export class BitbucketClient {
  private readonly limiter = DEFAULT_LIMITER;

  constructor(public readonly client: APIClient) {}

  async getWorkspace(workspace: string): Promise<Workspace | undefined> {
    try {
      const {data} = await this.limiter.schedule(() =>
        this.client.workspaces.getWorkspace({workspace})
      );

      return {
        slug: data.slug,
        name: data.name,
        type: data.type,
        uuid: data.uuid,
        createdOn: data.created_on,
        htmlUrl: data.links?.html?.href,
      };
    } catch (err) {
      throw new VError(
        buildInnerError(err),
        'Error fetching workspace %s',
        workspace
      );
    }
  }
}
