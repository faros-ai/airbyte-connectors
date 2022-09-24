import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Harness} from './harness';
import {HarnessConfig} from './harness_models';
import {Executions} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new HarnessSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Harness source implementation. */
export class HarnessSource extends AirbyteSourceBase<HarnessConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: HarnessConfig): Promise<[boolean, VError]> {
    try {
      const harness = Harness.instance(config, this.logger);
      await harness.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: HarnessConfig): AirbyteStreamBase[] {
    return [new Executions(config, this.logger)];
  }
}
