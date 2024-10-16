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
import {calculateDateRange, nextBucketId} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_FAROS_API_URL,
  DEFAULT_FETCH_TEAMS,
  DEFAULT_RUN_MODE,
  GitHub,
} from './github';
import {RunModeStreams, TeamStreamNames} from './streams/common';
import {FarosArtifacts} from './streams/faros_artifacts';
import {FarosCodeScanningAlerts} from './streams/faros_code_scanning_alerts';
import {FarosCommits} from './streams/faros_commits';
import {FarosContributorsStats} from './streams/faros_contributors_stats';
import {FarosCopilotSeats} from './streams/faros_copilot_seats';
import {FarosCopilotUsage} from './streams/faros_copilot_usage';
import {FarosDependabotAlerts} from './streams/faros_dependabot_alerts';
import {FarosIssues} from './streams/faros_issues';
import {FarosLabels} from './streams/faros_labels';
import {FarosOrganizations} from './streams/faros_organizations';
import {FarosOutsideCollaborators} from './streams/faros_outside_collaborators';
import {FarosProjects} from './streams/faros_projects';
import {FarosPullRequestComments} from './streams/faros_pull_request_comments';
import {FarosPullRequests} from './streams/faros_pull_requests';
import {FarosReleases} from './streams/faros_releases';
import {FarosRepositories} from './streams/faros_repositories';
import {FarosSamlSsoUsers} from './streams/faros_saml_sso_users';
import {FarosSecretScanningAlerts} from './streams/faros_secret_scanning_alerts';
import {FarosTags} from './streams/faros_tags';
import {FarosTeamMemberships} from './streams/faros_team_memberships';
import {FarosTeams} from './streams/faros_teams';
import {FarosUsers} from './streams/faros_users';
import {FarosWorkflowJobs} from './streams/faros_workflow_jobs';
import {FarosWorkflowRuns} from './streams/faros_workflow_runs';
import {FarosWorkflows} from './streams/faros_workflows';
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

  makeFarosClient(config: GitHubConfig): FarosClient {
    return new FarosClient({
      url: config.api_url ?? DEFAULT_FAROS_API_URL,
      apiKey: config.api_key,
    });
  }

  streams(config: GitHubConfig): AirbyteStreamBase[] {
    let farosClient;
    if (config.api_key) {
      farosClient = this.makeFarosClient(config);
    }
    return [
      new FarosArtifacts(config, this.logger, farosClient),
      new FarosCodeScanningAlerts(config, this.logger, farosClient),
      new FarosCommits(config, this.logger, farosClient),
      new FarosContributorsStats(config, this.logger, farosClient),
      new FarosCopilotSeats(config, this.logger, farosClient),
      new FarosCopilotUsage(config, this.logger, farosClient),
      new FarosDependabotAlerts(config, this.logger, farosClient),
      new FarosIssues(config, this.logger, farosClient),
      new FarosLabels(config, this.logger, farosClient),
      new FarosOrganizations(config, this.logger, farosClient),
      new FarosOutsideCollaborators(config, this.logger, farosClient),
      new FarosProjects(config, this.logger, farosClient),
      new FarosPullRequests(config, this.logger, farosClient),
      new FarosPullRequestComments(config, this.logger, farosClient),
      new FarosReleases(config, this.logger, farosClient),
      new FarosRepositories(config, this.logger, farosClient),
      new FarosSamlSsoUsers(config, this.logger, farosClient),
      new FarosSecretScanningAlerts(config, this.logger, farosClient),
      new FarosTags(config, this.logger, farosClient),
      new FarosTeams(config, this.logger, farosClient),
      new FarosTeamMemberships(config, this.logger, farosClient),
      new FarosUsers(config, this.logger, farosClient),
      new FarosWorkflows(config, this.logger, farosClient),
      new FarosWorkflowJobs(config, this.logger, farosClient),
      new FarosWorkflowRuns(config, this.logger, farosClient),
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

    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    if (config.round_robin_bucket_execution) {
      const next = nextBucketId(config, state);
      this.logger.info(
        `Using round robin bucket execution. Bucket id: ${next}`
      );
      return {
        config: {
          ...config,
          startDate,
          endDate,
          bucket_id: next,
        },
        catalog: {streams},
        state: {
          ...state,
          __bucket_execution_state: {
            last_executed_bucket_id: next,
          },
        },
      };
    }

    return {
      config: {
        ...config,
        startDate,
        endDate,
      },
      catalog: {streams},
      state,
    };
  }
}
