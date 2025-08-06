import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {applyRoundRobinBucketing} from 'faros-airbyte-common/common';
import VError from 'verror';

import {Datadog, DatadogConfig} from './datadog';
import {Incidents, Metrics, ServiceLevelObjectives, Users} from './streams';

export const StreamNames = [
  'incidents',
  'metrics',
  'service_level_objectives',
  'users',
];

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
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
      new ServiceLevelObjectives(datadog, this.logger),
    ];
  }

  async onBeforeRead(
    config: DatadogConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: DatadogConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streams = config.custom_streams?.length
      ? catalog.streams.filter((stream) =>
          config.custom_streams.includes(stream.stream.name)
        )
      : catalog.streams;

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );
    return {
      config: newConfig,
      catalog: {streams},
      state: newState,
    };
  }
}
