import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {BitbucketServer, BitbucketServerConfig} from '../bitbucket-server';

export abstract class StreamBase extends AirbyteStreamBase {
  config: BitbucketServerConfig;
  logger: AirbyteLogger;
  get server(): BitbucketServer {
    return BitbucketServer.instance(this.config, this.logger);
  }

  // Fetch the project key from the Bitbucket API in case it was renamed
  async fetchProjectKey(configProjectKey: string): Promise<string> {
    return (await this.server.project(configProjectKey)).key;
  }
}
