import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureRepoConfig, AzureRepos} from './azure-repos';
import {PullRequests, Repositories, Users} from './streams';
import {Commits} from './streams/commits';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new AzureRepoSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzureRepo source implementation. */
export class AzureRepoSource extends AirbyteSourceBase<AzureRepoConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AzureRepoConfig): Promise<[boolean, VError]> {
    try {
      const azureRepos = await AzureRepos.make(config, this.logger);
      await azureRepos.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureRepoConfig): AirbyteStreamBase[] {
    return [
      new Commits(config, this.logger),
      new PullRequests(config, this.logger),
      new Repositories(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
