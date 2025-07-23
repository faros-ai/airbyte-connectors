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
import {calculateDateRange} from 'faros-airbyte-common/common';
import VError from 'verror';

import {DEFAULT_CUTOFF_DAYS, DEFAULT_RUN_MODE, Gerrit} from './gerrit';
import {RunMode, RunModeStreams} from './streams/common';
import {FarosAccounts} from './streams/faros_accounts';
import {FarosChanges} from './streams/faros_changes';
import {FarosProjects} from './streams/faros_projects';
import {GerritConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GerritSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GerritSource extends AirbyteSourceBase<GerritConfig> {
  get type(): string {
    return 'gerrit';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GerritConfig): Promise<[boolean, VError]> {
    try {
      const gerrit = await Gerrit.instance(config, this.logger);
      // Test connection by listing projects
      await gerrit.getProjects({limit: 1});
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: GerritConfig): AirbyteStreamBase[] {
    return [
      new FarosProjects(config, this.logger),
      new FarosChanges(config, this.logger),
      new FarosAccounts(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: GerritConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GerritConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? DEFAULT_RUN_MODE],
    ].filter(
      (streamName) =>
        config.run_mode !== RunMode.Custom ||
        !config.custom_streams?.length ||
        config.custom_streams.includes(streamName)
    );

    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );

    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    return {
      config: {
        ...config,
        startDate,
        endDate,
      } as GerritConfig,
      catalog: {streams},
      state,
    };
  }
}
