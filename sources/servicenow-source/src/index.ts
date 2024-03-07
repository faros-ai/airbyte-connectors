import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {ServiceNow, ServiceNowConfig} from './servicenow/servicenow';
import {Incidents, Users} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ServiceNowSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class ServiceNowSource extends AirbyteSourceBase<ServiceNowConfig> {
  get type(): string {
    return 'servicenow';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: ServiceNowConfig): Promise<[boolean, VError]> {
    try {
      const servicenow = ServiceNow.instance(config, this.logger);
      await servicenow.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: ServiceNowConfig): AirbyteStreamBase[] {
    const servicenow = ServiceNow.instance(config, this.logger);
    return [
      new Incidents(servicenow, this.logger),
      new Users(servicenow, this.logger),
    ];
  }
}
