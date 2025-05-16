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
  calculateDateRange,
  validateBucketingConfig,
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {
  DEFAULT_API_URL,
  DEFAULT_CUTOFF_DAYS,
  GitLab,
} from './gitlab';
import {GroupRepoFilter} from './streams/common';
import {FarosGroups} from './streams/faros_groups';
import {GitLabConfig} from './types';

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
      await GitLab.instance(config, this.logger);
      if (config.round_robin_bucket_execution) {
        validateBucketingConfig(config, (message: string) => this.logger.info(message));
      }
      await GroupRepoFilter.instance(
        config,
        this.logger,
        this.makeFarosClient(config)
      ).getGroups();
      return [true, undefined];
    } catch (err: any) {
      return [false, err];
    }
  }

  makeFarosClient(config: GitLabConfig): FarosClient | undefined {
    if (!config.api_key) {
      return undefined;
    }
    return new FarosClient({
      url: config.api_url ?? 'https://prod.api.faros.ai',
      apiKey: config.api_key,
    });
  }

  streams(config: GitLabConfig): AirbyteStreamBase[] {
    const farosClient = this.makeFarosClient(config);
    return [
      new FarosGroups(config, this.logger, farosClient),
    ];
  }

  async onBeforeRead(
    config: GitLabConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GitLabConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );
    return {
      config: {
        ...newConfig,
        startDate,
        endDate,
      } as GitLabConfig,
      catalog,
      state: newState,
    };
  }
}
