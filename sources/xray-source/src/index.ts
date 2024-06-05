import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {TestPlans} from './streams/testPlans';
import {TestPlanTests} from './streams/testPlanTests';
import {Tests} from './streams/tests';
import {XrayConfig} from './types';
import {Xray} from './xray';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new XraySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class XraySource extends AirbyteSourceBase<XrayConfig> {
  get type(): string {
    return 'xray';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: XrayConfig): Promise<[boolean, VError]> {
    try {
      const xray = await Xray.instance(config, this.logger);
      await xray.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: XrayConfig): AirbyteStreamBase[] {
    return [
      new TestPlans(config, this.logger),
      new Tests(config, this.logger),
      new TestPlanTests(config, this.logger),
    ];
  }
}
