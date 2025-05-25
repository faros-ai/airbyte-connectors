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
import {
  applyRoundRobinBucketing,
  calculateDateRange,
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {DEFAULT_CUTOFF_DAYS, DEFAULT_RUN_MODE, GitLab} from './gitlab';
import {GroupFilter} from './group-filter';
import {RunMode, RunModeStreams} from './streams/common';
import {FarosGroups} from './streams/faros_groups';
import {FarosProjects} from './streams/faros_projects';
import {GitLabConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitLabSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitLabSource extends AirbyteSourceBase<GitLabConfig> {
  get type(): string {
    return 'gitlab';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitLabConfig): Promise<[boolean, VError]> {
    try {
      await GitLab.instance(config, this.logger);
      await GroupFilter.instance(
        config,
        this.logger,
        this.makeFarosClient(config)
      ).getGroups();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  makeFarosClient(config: GitLabConfig): FarosClient | undefined {
    if (!config.api_key) {
      return undefined;
    }
    return new FarosClient({
      url: config.api_url ?? 'https://api.faros.ai',
      apiKey: config.api_key,
    });
  }

  streams(config: GitLabConfig): AirbyteStreamBase[] {
    const farosClient = this.makeFarosClient(config);
    return [
      new FarosGroups(config, this.logger, farosClient),
      new FarosProjects(config, this.logger, farosClient),
    ];
  }

  async onBeforeRead(
    config: GitLabConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GitLabConfig;
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

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );
    return {
      config: {
        ...newConfig,
        startDate,
        endDate,
      } as GitLabConfig,
      catalog: {streams},
      state: newState,
    };
  }
}
