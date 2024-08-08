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

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_FETCH_TEAMS,
  DEFAULT_RUN_MODE,
  GitHub,
} from './github';
import {RunModeStreams, TeamStreamNames} from './streams/common';
import {FarosCommits} from './streams/faros_commits';
import {FarosContributorsStats} from './streams/faros_contributors_stats';
import {FarosCopilotSeats} from './streams/faros_copilot_seats';
import {FarosCopilotUsage} from './streams/faros_copilot_usage';
import {FarosLabels} from './streams/faros_labels';
import {FarosOrganizations} from './streams/faros_organizations';
import {FarosOutsideCollaborators} from './streams/faros_outside_collaborators';
import {FarosProjects} from './streams/faros_projects';
import {FarosPullRequestComments} from './streams/faros_pull_request_comments';
import {FarosPullRequests} from './streams/faros_pull_requests';
import {FarosReleases} from './streams/faros_releases';
import {FarosRepositories} from './streams/faros_repositories';
import {FarosTags} from './streams/faros_tags';
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
      new FarosCommits(config, this.logger),
      new FarosContributorsStats(config, this.logger),
      new FarosCopilotSeats(config, this.logger),
      new FarosCopilotUsage(config, this.logger),
      new FarosLabels(config, this.logger),
      new FarosOrganizations(config, this.logger),
      new FarosOutsideCollaborators(config, this.logger),
      new FarosProjects(config, this.logger),
      new FarosPullRequests(config, this.logger),
      new FarosPullRequestComments(config, this.logger),
      new FarosReleases(config, this.logger),
      new FarosRepositories(config, this.logger),
      new FarosTags(config, this.logger),
      new FarosTeams(config, this.logger),
      new FarosTeamMemberships(config, this.logger),
      new FarosUsers(config, this.logger),
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
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? DEFAULT_RUN_MODE],
    ];
    if (config.fetch_teams ?? DEFAULT_FETCH_TEAMS) {
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
