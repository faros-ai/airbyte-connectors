import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
  fileJson,
} from 'faros-airbyte-cdk';
import path from 'path';
import VError from 'verror';

import {Statuspage, StatuspageConfig} from './statuspage';
import {Incidents, IncidentUpdates, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new StatuspageSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Statuspage source implementation. */
export class StatuspageSource extends AirbyteSourceBase<StatuspageConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
  }
  async checkConnection(config: StatuspageConfig): Promise<[boolean, VError]> {
    try {
      const statuspage = Statuspage.instance(config, this.logger);
      await statuspage.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: StatuspageConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config, this.logger),
      new IncidentUpdates(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
