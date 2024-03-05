import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Incidents, Teams, Users} from './streams';
import {Victorops, VictoropsConfig} from './victorops';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new VictoropsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Victorops source implementation. */
export class VictoropsSource extends AirbyteSourceBase<VictoropsConfig> {
  get type(): string {
    return 'victorops';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: VictoropsConfig): Promise<[boolean, VError]> {
    try {
      const victorops = Victorops.instance(config, this.logger);

      await victorops.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: VictoropsConfig): AirbyteStreamBase[] {
    return [
      new Incidents(config, this.logger),
      new Teams(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
