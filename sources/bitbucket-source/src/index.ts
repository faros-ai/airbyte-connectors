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

import {Bitbucket, DEFAULT_CUTOFF_DAYS, DEFAULT_RUN_MODE} from './bitbucket';
import {
  Commits,
  PullRequestsWithActivities,
  Repositories,
  Tags,
  Workspaces,
  WorkspaceUsers,
} from './streams';
import {RunMode, RunModeStreams} from './streams/common';
import {BitbucketConfig} from './types';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new BitbucketSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class BitbucketSource extends AirbyteSourceBase<BitbucketConfig> {
  get type(): string {
    return 'bitbucket';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: BitbucketConfig): Promise<[boolean, VError]> {
    try {
      const bitbucket = Bitbucket.instance(
        config as BitbucketConfig,
        this.logger
      );
      await bitbucket.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }

  streams(config: BitbucketConfig): AirbyteStreamBase[] {
    const emitActivities = config.run_mode !== RunMode.Minimum;

    return [
      new Commits(config, this.logger),
      new PullRequestsWithActivities(config, this.logger, emitActivities),
      new Repositories(config, this.logger),
      new Tags(config, this.logger),
      new WorkspaceUsers(config, this.logger),
      new Workspaces(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: BitbucketConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: BitbucketConfig;
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
    const requestedStreams = new Set(
      streams.map((stream) => stream.stream.name)
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
        requestedStreams,
        startDate,
        endDate,
      },
      catalog: {streams},
      state,
    };
  }
}
