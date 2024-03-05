import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Backlog, BacklogConfig} from './backlog';
import {Issues, Projects, Users} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new BacklogSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}
/** Backlog source implementation. */
export class BacklogSource extends AirbyteSourceBase<BacklogConfig> {
  get type(): string {
    return 'backlog';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: BacklogConfig): Promise<[boolean, VError]> {
    try {
      const backlog = await Backlog.instance(config, this.logger);
      await backlog.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: BacklogConfig): AirbyteStreamBase[] {
    return [
      new Issues(config, this.logger),
      new Projects(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
