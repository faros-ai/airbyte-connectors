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

import {Squadcast, SquadcastConfig} from './squadcast';
import {Events, Incidents, Services, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new SquadcastSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** SquadCast source implementation. */
export class SquadcastSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const squadcast = await Squadcast.instance(
        config as SquadcastConfig,
        this.logger
      );
      await squadcast.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Events(config as SquadcastConfig, this.logger),
      new Incidents(config as SquadcastConfig, this.logger),
      new Services(config as SquadcastConfig, this.logger),
      new Users(config as SquadcastConfig, this.logger),
    ];
  }
}
