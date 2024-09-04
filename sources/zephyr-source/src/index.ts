import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {TestCases} from './streams/test_cases';
import {TestCycles} from './streams/test_cycles';
import {TestExecutions} from './streams/test_executions';
import {ZephyrConfig} from './types';
import {Zephyr} from './zephyr';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ZephyrSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class ZephyrSource extends AirbyteSourceBase<ZephyrConfig> {
  get type(): string {
    return 'zephyr';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: ZephyrConfig): Promise<[boolean, VError]> {
    try {
      const zephyr = await Zephyr.instance(config, this.logger);
      await zephyr.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: ZephyrConfig): AirbyteStreamBase[] {
    return [
      new TestCycles(config, this.logger),
      new TestCases(config, this.logger),
      new TestExecutions(config, this.logger),
    ];
  }
}
