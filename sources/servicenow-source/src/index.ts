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

import {ServiceNow, ServiceNowConfig} from './servicenow/servicenow';
import {Incidents, Users} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ServiceNowSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class ServiceNowSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const servicenow = ServiceNow.instance(
        config as ServiceNowConfig,
        this.logger
      );
      await servicenow.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    const servicenow = ServiceNow.instance(
      config as ServiceNowConfig,
      this.logger
    );
    return [
      new Incidents(servicenow, this.logger),
      new Users(servicenow, this.logger),
    ];
  }
}
