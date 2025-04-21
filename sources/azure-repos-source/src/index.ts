import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AzureRepos} from './azure-repos';
import {AzureReposConfig} from './models';
import {PullRequests, Repositories, Users} from './streams';
import {Commits} from './streams/commits';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzureRepoSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** AzureRepo source implementation. */
export class AzureRepoSource extends AirbyteSourceBase<AzureReposConfig> {
  get type(): string {
    return 'azure-repos';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: AzureReposConfig): Promise<[boolean, VError]> {
    try {
      const azureRepos = await AzureRepos.instance<AzureRepos>(
        config,
        this.logger,
        config.branch_pattern,
        config.repositories,
        config.fetch_tags,
        config.fetch_branch_commits
      );
      await azureRepos.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureReposConfig): AirbyteStreamBase[] {
    return [
      new Commits(config, this.logger),
      new PullRequests(config, this.logger),
      new Repositories(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
