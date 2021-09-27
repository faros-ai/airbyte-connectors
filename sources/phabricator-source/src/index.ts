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

import {JenkinsBuilds} from './streams';

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
    if (config.token === 'ok') {
      return [true, undefined];
    }
    return [false, new VError('Token is not ok')];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [new JenkinsBuilds(this.logger)];
  }
}
