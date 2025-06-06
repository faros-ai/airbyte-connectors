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
import VError from 'verror';

import {LaunchDarkly, LaunchDarklyConfig} from './launchdarkly';
import {
  Environments,
  Experiments,
  FeatureFlags,
  Projects,
  Users,
} from './streams';

export const StreamNames = [
  'projects',
  'environments',
  'feature_flags',
  'users',
  'experiments',
];

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new LaunchDarklySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class LaunchDarklySource extends AirbyteSourceBase<LaunchDarklyConfig> {
  get type(): string {
    return 'LaunchDarkly';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(
    config: LaunchDarklyConfig
  ): Promise<[boolean, VError]> {
    try {
      const launchdarkly = LaunchDarkly.instance(config, this.logger);
      await launchdarkly.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, null];
  }

  streams(config: LaunchDarklyConfig): AirbyteStreamBase[] {
    const launchdarkly = LaunchDarkly.instance(config, this.logger);
    return [
      new Projects(launchdarkly, this.logger),
      new Environments(launchdarkly, this.logger),
      new FeatureFlags(launchdarkly, this.logger),
      new Users(launchdarkly, this.logger),
      new Experiments(launchdarkly, this.logger),
    ];
  }

  async onBeforeRead(
    config: LaunchDarklyConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: LaunchDarklyConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streams = config.custom_streams?.length
      ? catalog.streams.filter((stream) =>
          config.custom_streams.includes(stream.stream.name)
        )
      : catalog.streams;
    return {
      config,
      catalog: {streams},
      state,
    };
  }
}
