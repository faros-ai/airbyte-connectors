import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {BambooHR, BambooHRConfig} from './bamboohr';
import {Users} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BambooHRSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** BambooHR source implementation. */
export class BambooHRSource extends AirbyteSourceBase<BambooHRConfig> {
  get type(): string {
    return 'bamboohr';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: BambooHRConfig): Promise<[boolean, VError]> {
    try {
      const bambooHR = await BambooHR.instance(config, this.logger);
      await bambooHR.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: BambooHRConfig): AirbyteStreamBase[] {
    return [new Users(config, this.logger)];
  }
}
