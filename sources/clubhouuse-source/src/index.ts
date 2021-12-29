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

import {Clubhouse, ClubhouseConfig} from './clubhouse';
import {
  Epics,
  Iterations,
  Members,
  Projects,
  Repositories,
  Stories,
} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ClubhouseSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}
/** Clubhouse source implementation. */
export class ClubhouseSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const clubhouse = new Clubhouse(config as ClubhouseConfig);
      await clubhouse.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Projects(config as ClubhouseConfig, this.logger),
      new Iterations(config as ClubhouseConfig, this.logger),
      new Epics(config as ClubhouseConfig, this.logger),
      new Stories(config as ClubhouseConfig, this.logger),
      new Members(config as ClubhouseConfig, this.logger),
      new Repositories(config as ClubhouseConfig, this.logger),
    ];
  }
}
