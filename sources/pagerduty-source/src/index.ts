import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Pagerduty, PagerdutyConfig} from './pagerduty';
import {
  IncidentLogEntries,
  Incidents,
  PrioritiesResource,
  Teams,
  Users,
} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new PagerdutySource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Pagerduty source implementation. */
export class PagerdutySource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const pagerduty = Pagerduty.instance(
        config as PagerdutyConfig,
        this.logger
      );
      await pagerduty.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new IncidentLogEntries(config as PagerdutyConfig, this.logger),
      new Incidents(config as PagerdutyConfig, this.logger),
      new PrioritiesResource(config as PagerdutyConfig, this.logger),
      new Users(config as PagerdutyConfig, this.logger),
      new Teams(config as PagerdutyConfig, this.logger),
    ];
  }
}
