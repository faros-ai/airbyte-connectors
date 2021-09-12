import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {createClient} from './bitbucket';
import {BitbucketWorkspace} from './stream';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BitbucketSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

class BitbucketSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    const [client, errorMessage] = await createClient(config);
    if (client) {
      return [true, undefined];
    }

    return [false, new VError(errorMessage)];
  }

  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [new BitbucketWorkspace(config, this.logger)];
  }
}
