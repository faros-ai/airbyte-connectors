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

import {DataDog, DataDogConfig} from './datadog';
import {Incidents, Users} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new DataDogSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class DataDogSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const datadog = DataDog.instance(config as DataDogConfig, this.logger);
      await datadog.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    const datadog = DataDog.instance(config as DataDogConfig, this.logger);
    return [
      new Incidents(datadog, this.logger),
      new Users(datadog, this.logger),
    ];
  }
}
