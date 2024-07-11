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
import {calculateDateRange} from 'faros-airbyte-common/common';
import VError from 'verror';

import {DEFAULT_CUTOFF_DAYS, GitHub} from './github';
import {RunMode, RunModeStreams, TeamStreamNames} from './streams/common';
import {FarosCommits} from './streams/faros_commits';
import {FarosCopilotSeats} from './streams/faros_copilot_seats';
import {FarosCopilotUsage} from './streams/faros_copilot_usage';
import {FarosOrganizations} from './streams/faros_organizations';
import {FarosPullRequests} from './streams/faros_pull_requests';
import {FarosRepositories} from './streams/faros_repositories';
import {FarosTeamMemberships} from './streams/faros_team_memberships';
import {FarosTeams} from './streams/faros_teams';
import {FarosUsers} from './streams/faros_users';
import {GitHubConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitHubSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitHubSource extends AirbyteSourceBase<GitHubConfig> {
  get type(): string {
    return 'github';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitHubConfig): Promise<[boolean, VError]> {
    try {
      await GitHub.instance(config, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: GitHubConfig): AirbyteStreamBase[] {
    return [
      new FarosCopilotSeats(config, this.logger),
      new FarosCopilotUsage(config, this.logger),
      new FarosOrganizations(config, this.logger),
      new FarosRepositories(config, this.logger),
      new FarosPullRequests(config, this.logger),
      new FarosUsers(config, this.logger),
      new FarosTeams(config, this.logger),
      new FarosTeamMemberships(config, this.logger),
      new FarosCommits(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: GitHubConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GitHubConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streamNames = [...RunModeStreams[config.run_mode ?? RunMode.Full]];
    if (config.fetch_teams) {
      streamNames.push(...TeamStreamNames);
    }
    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );

    const {startDate} = calculateDateRange({
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    return {
      config: {
        ...config,
        startDate,
      },
      catalog: {streams},
      state,
    };
  }
}
