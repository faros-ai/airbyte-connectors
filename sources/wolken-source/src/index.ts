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

import {ConfigurationItems} from './streams/configuration_items';
import {Incidents} from './streams/incidents';
import {Users} from './streams/users';
import {DEFAULT_CUTOFF_DAYS, Wolken, WolkenConfig} from './wolken';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new WolkenSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Wolken source implementation. */
export class WolkenSource extends AirbyteSourceBase<WolkenConfig> {
  get type(): string {
    return 'wolken';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: WolkenConfig): Promise<[boolean, VError]> {
    try {
      const wolken = Wolken.instance(config, this.logger);
      await wolken.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: WolkenConfig): AirbyteStreamBase[] {
    return [
      new ConfigurationItems(config, this.logger),
      new Incidents(config, this.logger),
      new Users(config, this.logger)
    ];
  }

  async onBeforeRead(
    config: WolkenConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: WolkenConfig;
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
      } as WolkenConfig,
      catalog: catalog,
      state: state,
    };
  }
}
