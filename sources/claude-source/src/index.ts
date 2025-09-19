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

import {Claude, DEFAULT_CUTOFF_DAYS} from './claude';
import {ClaudeCodeUsageReport} from './streams/claude_code_usage_report';
import {Users} from './streams/users';
import {ClaudeConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ClaudeSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class ClaudeSource extends AirbyteSourceBase<ClaudeConfig> {
  get type(): string {
    return 'claude';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: ClaudeConfig): Promise<[boolean, VError]> {
    try {
      const claude = Claude.instance(config, this.logger);
      await claude.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: ClaudeConfig): AirbyteStreamBase[] {
    return [
      new ClaudeCodeUsageReport(config, this.logger),
      new Users(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: ClaudeConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: ClaudeConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
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
      } as ClaudeConfig,
      catalog,
      state,
    };
  }
}
