import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {
  applyRoundRobinBucketing,
  validateBucketingConfig,
} from 'faros-airbyte-common/common';
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
        config.fetch_branch_commits,
        config.bucket_id,
        config.bucket_total
      );
      await azureRepos.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  async onBeforeRead(
    config: AzureReposConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: AzureReposConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    validateBucketingConfig(config, this.logger.info.bind(this.logger));
    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );
    return {
      config: newConfig as AzureReposConfig,
      catalog,
      state: newState,
    };
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
