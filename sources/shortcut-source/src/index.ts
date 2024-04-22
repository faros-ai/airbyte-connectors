import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Shortcut, ShortcutConfig} from './shortcut';
import {Epics, Iterations, Members, Projects, Stories} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new ShortcutSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}
/** Shortcut source implementation. */
export class ShortcutSource extends AirbyteSourceBase<ShortcutConfig> {
  get type(): string {
    return 'shortcut';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: ShortcutConfig): Promise<[boolean, VError]> {
    try {
      const shortcut = Shortcut.instance(config);
      await (await shortcut).checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: ShortcutConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Iterations(config, this.logger),
      new Epics(config, this.logger, config.project_public_id),
      new Stories(config, this.logger),
      new Members(config, this.logger),
    ];
  }
}
