import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {OpsGenie, OpsGenieConfig} from './opsgenie/opsgenie';
import {Alerts, Incidents, Teams, Users} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new OpsGenieSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** OpsGenie source implementation. */
export class OpsGenieSource extends AirbyteSourceBase<OpsGenieConfig> {
  get type(): string {
    return 'opsgenie';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: OpsGenieConfig): Promise<[boolean, VError]> {
    try {
      const fireHydrant = OpsGenie.instance(config, this.logger);
      await fireHydrant.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: OpsGenieConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config, this.logger),
      new Alerts(config, this.logger),
      new Teams(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
