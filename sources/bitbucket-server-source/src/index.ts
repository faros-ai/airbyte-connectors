import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BitbucketServerSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketServerSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: any): Promise<[boolean, VError]> {
    return [true, undefined];
  }

  streams(config: any): AirbyteStreamBase[] {
    return [];
  }
}
