import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {BitbucketServer} from '../bitbucket-server/bitbucket-server';
import {BitbucketServerConfig} from '../bitbucket-server/types';

export abstract class StreamBase extends AirbyteStreamBase {
  config: BitbucketServerConfig;
  logger: AirbyteLogger;
  get server(): BitbucketServer {
    return BitbucketServer.instance(this.config, this.logger);
  }
}
