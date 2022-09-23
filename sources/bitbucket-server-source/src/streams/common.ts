import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {BitbucketServer, BitbucketServerConfig} from '../bitbucket-server';

export abstract class StreamBase extends AirbyteStreamBase {
  config: BitbucketServerConfig;
  logger: AirbyteLogger;
  get server(): BitbucketServer {
    return BitbucketServer.instance(this.config, this.logger);
  }
}
