import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {createClient} from './bitbucket';
import {BitbucketRepositories, BitbucketWorkspaces} from './stream';
import {BitbucketConfig} from './types';

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

  async checkConnection(config: BitbucketConfig): Promise<[boolean, VError]> {
    const [client, errorMessage] = await createClient(config);
    if (client) {
      return [true, undefined];
    }

    return [false, new VError(errorMessage)];
  }

  streams(config: BitbucketConfig): AirbyteStreamBase[] {
    return [
      new BitbucketWorkspaces(config, this.logger),
      new BitbucketRepositories(config, this.logger),
    ];
  }
}
