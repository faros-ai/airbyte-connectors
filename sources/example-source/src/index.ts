import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {SourceConfig} from './config';
import {Builds} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ExampleSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class ExampleSource extends AirbyteSourceBase<SourceConfig> {
  get type(): string {
    return 'example';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: SourceConfig): Promise<[boolean, VError]> {
    if (config.user === 'chris') {
      return [true, undefined];
    }
    return [false, new VError('User is not chris')];
  }
  streams(config: SourceConfig): AirbyteStreamBase[] {
    return [new Builds(config, this.logger)];
  }
}
