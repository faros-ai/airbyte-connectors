import BitbucketServerClient from '@atlassian/bitbucket-server';
import {AirbyteLogger} from 'faros-airbyte-cdk';

import {BitbucketServerConfig} from './types';

export class BitbucketServer {
  private static server: BitbucketServer = null;

  constructor(
    private readonly client: BitbucketServerClient,
    private readonly pagelen: number,
    private readonly logger: AirbyteLogger
  ) {}

  static instance(
    config: BitbucketServerConfig,
    logger: AirbyteLogger
  ): BitbucketServer {
    if (BitbucketServer.server) return BitbucketServer.server;
  }

  private static isValidateConfig(
    config: BitbucketServerConfig
  ): [boolean, string] {
    const existToken = config.token && !config.username && !config.password;
    const existAuth = !config.token && config.username && config.password;

    if (!existToken && !existAuth) {
      return [
        false,
        'Invalid authentication details. Please provide either only the ' +
          'Bitbucket access token or Bitbucket username and password',
      ];
    }

    if (!config.projects || config.projects.length < 1) {
      return [false, 'No projects provided'];
    }
    try {
      config.serverUrl && new URL(config.serverUrl);
    } catch (error) {
      return [false, 'server_url: must be a valid url'];
    }

    return [true, undefined];
  }
}
