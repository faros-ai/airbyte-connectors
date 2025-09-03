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

import {AutocompleteAnalytics} from './streams/autocomplete_analytics';
import {CascadeLinesAnalytics} from './streams/cascade_lines_analytics';
import {UserPageAnalytics} from './streams/user_page_analytics';
import {WindsurfConfig} from './types';
import {DEFAULT_CUTOFF_DAYS, Windsurf} from './windsurf';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new WindsurfSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class WindsurfSource extends AirbyteSourceBase<WindsurfConfig> {
  get type(): string {
    return 'windsurf';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: WindsurfConfig): Promise<[boolean, VError]> {
    try {
      const windsurf = Windsurf.instance(config, this.logger);
      await windsurf.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: WindsurfConfig): AirbyteStreamBase[] {
    return [
      new AutocompleteAnalytics(config, this.logger),
      new CascadeLinesAnalytics(config, this.logger),
      new UserPageAnalytics(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: WindsurfConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: WindsurfConfig;
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
      } as WindsurfConfig,
      catalog,
      state,
    };
  }
}
