import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Statuspage, StatuspageConfig} from './statuspage';
import {
  ComponentGroups,
  Components,
  ComponentUptimes,
  Incidents,
  Pages,
  Users,
} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new StatuspageSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Statuspage source implementation. */
export class StatuspageSource extends AirbyteSourceBase<StatuspageConfig> {
  get type(): string {
    return 'statuspage';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: StatuspageConfig): Promise<[boolean, VError]> {
    try {
      const statuspage = Statuspage.instance(config, this.logger);
      await statuspage.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: StatuspageConfig): AirbyteStreamBase[] {
    return [
      ComponentGroups,
      Components,
      Incidents,
      Pages,
      Users,
      ComponentUptimes,
    ].map((Stream) => new Stream(config, this.logger));
  }
}
