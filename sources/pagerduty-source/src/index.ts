import {Command} from 'commander';
import {
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
export class PagerdutySource extends AirbyteSourceBase<PagerdutyConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: PagerdutyConfig): Promise<[boolean, VError]> {
    try {
      const pagerduty = Pagerduty.instance(config, this.logger);
      await pagerduty.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: PagerdutyConfig): AirbyteStreamBase[] {
    return [
      new IncidentLogEntries(config, this.logger),
      new Incidents(config, this.logger),
      new PrioritiesResource(config, this.logger),
      new Users(config, this.logger),
      new Teams(config, this.logger),
    ];
  }
}
