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

import {OpsGenie, OpsGenieConfig} from './opsgenie/opsgenie';
import {Incidents, Teams, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new OpsGenieSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** OpsGenie source implementation. */
export class OpsGenieSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const fireHydrant = OpsGenie.instance(
        config as OpsGenieConfig,
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
      new Incidents(config as OpsGenieConfig, this.logger),
      new Teams(config as OpsGenieConfig, this.logger),
      new Users(config as OpsGenieConfig, this.logger),
    ];
  }
}
