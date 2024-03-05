import {Command} from 'commander';
import {
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
export class FireHydrantSource extends AirbyteSourceBase<FireHydrantConfig> {
  get type(): string {
    return 'firehydrant';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: FireHydrantConfig): Promise<[boolean, VError]> {
    try {
      const fireHydrant = FireHydrant.instance(config, this.logger);
      await fireHydrant.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: FireHydrantConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config, this.logger),
      new Teams(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
