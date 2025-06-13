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

import {Codacy} from './codacy';
import {CodeQuality} from './streams/code_quality';
import {Issues} from './streams/issues';
import {Repositories} from './streams/repositories';
import {CodacyConfig} from './types';

export const DEFAULT_CUTOFF_DAYS = 90;

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new CodacySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class CodacySource extends AirbyteSourceBase<CodacyConfig> {
  get type(): string {
    return 'codacy';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: CodacyConfig): Promise<[boolean, VError]> {
    try {
      const codacy = await Codacy.instance(config, this.logger);
      await codacy.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: CodacyConfig): AirbyteStreamBase[] {
    return [
      new Repositories(config, this.logger),
      new Issues(config, this.logger),
      new CodeQuality(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: CodacyConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: CodacyConfig;
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
      } as CodacyConfig,
      catalog,
      state,
    };
  }
}
