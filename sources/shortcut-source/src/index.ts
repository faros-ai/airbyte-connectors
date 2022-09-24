import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
  fileJson,
} from 'faros-airbyte-cdk';
import path from 'path';
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
export class ShortcutSource extends AirbyteSourceBase<ShortcutConfig> {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(
      fileJson(path.resolve(__dirname, '../resources/spec.json'))
    );
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
