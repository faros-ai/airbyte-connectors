import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteLogger,
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
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_FAROS_GRAPH,
  DEFAULT_RUN_MODE,
  GitLab,
} from './gitlab';
import {RunMode, RunModeStreams} from './streams/common';
import {Commits} from './streams/commits';
import {Groups} from './streams/groups';
import {Issues} from './streams/issues';
import {MergeRequests} from './streams/merge_requests';
import {Projects} from './streams/projects';
import {Releases} from './streams/releases';
import {Tags} from './streams/tags';
import {Users} from './streams/users';
import {GitLabConfig} from './types';
import {WorkspaceRepoFilter} from './workspace-repo-filter';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitLabSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitLabSource extends AirbyteSourceBase<GitLabConfig> {
  constructor(readonly logger: AirbyteLogger) {
    super(logger);
  }

  get type(): string {
    return 'gitlab';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitLabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = await GitLab.instance(config, this.logger);
      await gitlab.checkConnection();
      
      if (config.use_faros_graph_repos_selection && !config.api_key) {
        return [
          false,
          new VError(
            'Faros credentials are required when using Faros Graph for repositories selection'
          ),
        ];
      }
      
      await WorkspaceRepoFilter.instance(
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
    const emitActivities = config.run_mode !== RunMode.Minimum;
    
    return [
      new Groups(config, this.logger, farosClient),
      new Projects(config, this.logger, farosClient),
      new MergeRequests(config, this.logger, farosClient, emitActivities),
      new Issues(config, this.logger, farosClient),
      new Commits(config, this.logger, farosClient),
      new Tags(config, this.logger, farosClient),
      new Releases(config, this.logger, farosClient),
      new Users(config, this.logger, farosClient),
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
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? DEFAULT_RUN_MODE],
    ].filter(
      (streamName) =>
        config.run_mode !== RunMode.Custom ||
        !config.custom_streams?.length ||
        config.custom_streams.includes(streamName)
    );
    
    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );

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
        requestedStreams: new Set(streamNames),
      } as GitLabConfig,
      catalog: {streams},
      state: newState,
    };
  }
}
