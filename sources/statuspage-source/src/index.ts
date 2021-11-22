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

import {Statuspage, StatuspageConfig} from './statuspage';
import {Incidents, IncidentUpdates, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new StatuspageSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** StatusPage source implementation. */
export class StatuspageSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const statuspage = Statuspage.instance(
        config as StatuspageConfig,
        this.logger
      );
      await statuspage.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config as StatuspageConfig, this.logger),
      new IncidentUpdates(config as StatuspageConfig, this.logger),
      new Users(config as StatuspageConfig, this.logger),
    ];
  }
}
