import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Datadog, DatadogConfig} from './datadog';
import {Incidents, Metrics, Users} from './streams';

export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new DatadogSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class DatadogSource extends AirbyteSourceBase<DatadogConfig> {
  get type(): string {
    return 'Datadog';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: DatadogConfig): Promise<[boolean, VError]> {
    try {
      const datadog = Datadog.instance(config, this.logger);
      await datadog.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: DatadogConfig): AirbyteStreamBase[] {
    const datadog = Datadog.instance(config, this.logger);
    return [
      new Incidents(datadog, this.logger),
      new Metrics(datadog, this.logger),
      new Users(datadog, this.logger),
    ];
  }
}
