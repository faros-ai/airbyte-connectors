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

import {ClaudeCode, DEFAULT_CUTOFF_DAYS} from './claude_code';
import {UsageReport} from './streams/usage_report';
import {Users} from './streams/users';
import {ClaudeCodeConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ClaudeCodeSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class ClaudeCodeSource extends AirbyteSourceBase<ClaudeCodeConfig> {
  get type(): string {
    return 'claude-code';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: ClaudeCodeConfig): Promise<[boolean, VError]> {
    try {
      const claudeCode = ClaudeCode.instance(config, this.logger);
      await claudeCode.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: ClaudeCodeConfig): AirbyteStreamBase[] {
    return [
      new UsageReport(config, this.logger),
      new Users(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: ClaudeCodeConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: ClaudeCodeConfig;
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
      } as ClaudeCodeConfig,
      catalog,
      state,
    };
  }
}
