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

import {FireHydrant, FireHydrantConfig} from './firehydrant/firehydrant';
import {Incidents, Teams, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new FireHydrantSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** FireHydrant source implementation. */
export class FireHydrantSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const fireHydrant = FireHydrant.instance(
        config as FireHydrantConfig,
        this.logger
      );
      await fireHydrant.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config as FireHydrantConfig, this.logger),
      new Teams(config as FireHydrantConfig, this.logger),
      new Users(config as FireHydrantConfig, this.logger),
    ];
  }
}
