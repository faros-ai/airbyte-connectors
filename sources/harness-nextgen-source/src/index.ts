import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {HarnessNextgen} from './harness-nextgen';
import {
  Environments,
  Executions,
  Organizations,
  Pipelines,
  Projects,
  Services,
} from './streams';
import {HarnessNextgenConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new HarnessNextgenSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class HarnessNextgenSource extends AirbyteSourceBase<HarnessNextgenConfig> {
  get type(): string {
    return 'harness-nextgen';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(
    config: HarnessNextgenConfig
  ): Promise<[boolean, VError]> {
    try {
      const harness = HarnessNextgen.instance(config, this.logger);
      await harness.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: HarnessNextgenConfig): AirbyteStreamBase[] {
    return [
      new Organizations(config, this.logger),
      new Projects(config, this.logger),
      new Pipelines(config, this.logger),
      new Services(config, this.logger),
      new Environments(config, this.logger),
      new Executions(config, this.logger),
    ];
  }
}
