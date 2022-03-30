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

import {Gitlab, GitlabConfig} from './gitlab';
import {Builds} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new GitlabCiSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
class GitlabCiSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: GitlabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = Gitlab.instance(config, this.logger);
      await gitlab.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    return [new Builds(this.logger)];
  }
}
