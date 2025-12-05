import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Harness} from './harness';
import {HarnessConfig} from './harness_models';
import {Executions, Organizations, Pipelines} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new HarnessSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Harness source implementation. */
export class HarnessSource extends AirbyteSourceBase<HarnessConfig> {
  get type(): string {
    return 'harness';
  }

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
    return [
      new Executions(config, this.logger),
      new Organizations(config, this.logger),
      new Pipelines(config, this.logger),
    ];
  }
}
