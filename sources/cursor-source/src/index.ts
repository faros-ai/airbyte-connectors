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

import {Cursor, DEFAULT_CUTOFF_DAYS} from './cursor';
import {AiCommitMetrics} from './streams/ai_commit_metrics';
import {DailyUsage} from './streams/daily_usage';
import {Members} from './streams/members';
import {UsageEvents} from './streams/usage_events';
import {CursorConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new CursorSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class CursorSource extends AirbyteSourceBase<CursorConfig> {
  get type(): string {
    return 'cursor';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: CursorConfig): Promise<[boolean, VError]> {
    try {
      const cursor = Cursor.instance(config, this.logger);
      await cursor.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: CursorConfig): AirbyteStreamBase[] {
    return [
      new AiCommitMetrics(config, this.logger),
      new DailyUsage(config, this.logger),
      new Members(config, this.logger),
      new UsageEvents(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: CursorConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: CursorConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    // Filter streams based on configuration
    let streams = catalog.streams;
    if (!config.fetch_ai_commit_metrics) {
      streams = streams.filter(
        (stream) => stream.stream.name !== 'ai_commit_metrics'
      );
    }

    return {
      config: {
        ...config,
        startDate,
        endDate,
      } as CursorConfig,
      catalog: {streams},
      state,
    };
  }
}
