import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {GitLab} from './gitlab';
import {FarosGroups} from './streams/faros_groups';
import {GitLabConfig, RunMode} from './types';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitLabSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitLabSource extends AirbyteSourceBase<GitLabConfig> {
  get type(): string {
    return 'gitlab';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitLabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = await GitLab.instance(config, this.logger);
      const client = gitlab['client'];
      await client.checkConnection();
      return [true, undefined];
    } catch (err: any) {
      return [false, err];
    }
  }

  streams(config: GitLabConfig): AirbyteStreamBase[] {
    return [new FarosGroups(config, this.logger)];
  }
}
