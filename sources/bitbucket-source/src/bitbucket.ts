import {Bitbucket} from 'bitbucket';
import {APIClient} from 'bitbucket/src/client/types';
import {AirbyteConfig} from 'faros-airbyte-cdk';

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
  htmlHref: string;
  name: string;
  slug: string;
  type: string;
}

export function createClient(config: AirbyteConfig): [APIClient, string] {
  if (
    (config.token && config.username && config.password) ||
    (config.token && (config.username || config.password)) ||
    (!config.token && (!config.username || !config.password))
  ) {
    return [
      null,
      'Invalid authentication details. Please provide either only the ' +
        'Bitbucket access token or Bitbucket username and password',
    ];
  }

  const auth = config.token
    ? {token: config.token}
    : {username: config.username, password: config.password};

  return [Bitbucket({baseUrl: config.service_url, auth}), null];
}
