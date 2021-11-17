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

import {Incidents, Teams, Users} from './streams';
import {Victorops, VictoropsConfig} from './victorops';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new VictoropsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Victorops source implementation. */
export class VictoropsSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const victorops = Victorops.instance(
        config as VictoropsConfig,
        this.logger
      );

      await victorops.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config as VictoropsConfig, this.logger),
      new Teams(config as VictoropsConfig, this.logger),
      new Users(config as VictoropsConfig, this.logger),
    ];
  }
}
