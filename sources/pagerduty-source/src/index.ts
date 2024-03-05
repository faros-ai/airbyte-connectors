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
  Services,
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
  get type(): string {
    return 'pagerduty';
  }

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
      IncidentLogEntries,
      Incidents,
      PrioritiesResource,
      Services,
      Teams,
      Users,
    ].map((Stream) => new Stream(config, this.logger));
  }
}
