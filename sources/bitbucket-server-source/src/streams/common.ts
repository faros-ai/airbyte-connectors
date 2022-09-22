import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {BitbucketServer, Config} from '../bitbucket-server';

export abstract class StreamBase extends AirbyteStreamBase {
  config: Config;
  logger: AirbyteLogger;
  get server(): BitbucketServer {
    return BitbucketServer.instance(this.config, this.logger);
  }
}
