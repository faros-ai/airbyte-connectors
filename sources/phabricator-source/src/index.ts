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

import {Phabricator, PhabricatorConfig} from './phabricator';
import {Commits, Repositories, Revisions} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new PhabricatorSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Phabricator source implementation. */
class PhabricatorSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      await Phabricator.make(config as PhabricatorConfig, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [
      new Repositories(config as PhabricatorConfig, this.logger),
      new Commits(config as PhabricatorConfig, this.logger),
      new Revisions(config as PhabricatorConfig, this.logger),
    ];
  }
}
