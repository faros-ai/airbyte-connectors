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

import {Shortcut, ShortcutConfig} from './shortcut';
import {Epics, Iterations, Members, Projects, Stories} from './streams';
/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new ShortcutSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}
/** Shortcut source implementation. */
export class ShortcutSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      const shortcut = Shortcut.instance(config as ShortcutConfig);
      await (await shortcut).checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: ShortcutConfig): AirbyteStreamBase[] {
    return [
      new Projects(config as ShortcutConfig, this.logger),
      new Iterations(config as ShortcutConfig, this.logger),
      new Epics(
        config as ShortcutConfig,
        this.logger,
        config.project_public_id
      ),
      new Stories(config as ShortcutConfig, this.logger),
      new Members(config as ShortcutConfig, this.logger),
    ];
  }
}
