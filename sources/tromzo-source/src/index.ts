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

import {Findings} from './streams/findings';
import {Tromzo} from './tromzo';
import {TromzoConfig} from './types';
import {calculateDateRange} from 'faros-airbyte-common/common';

export const DEFAULT_CUTOFF_DAYS = 90;

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new TromzoSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class TromzoSource extends AirbyteSourceBase<TromzoConfig> {
  get type(): string {
    return 'tromzo';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: TromzoConfig): Promise<[boolean, VError]> {
    try {
      const tromzo = await Tromzo.instance(config, this.logger);
      await tromzo.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: TromzoConfig): AirbyteStreamBase[] {
    return [new Findings(config, this.logger)];
  }
  async onBeforeRead(
    config: TromzoConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: TromzoConfig;
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
      } as TromzoConfig,
      catalog,
      state,
    };
  }
}
