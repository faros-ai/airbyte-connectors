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
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {
  DEFAULT_API_URL,
  DEFAULT_CUTOFF_DAYS,
  Jira,
  JIRA_CLOUD_REGEX,
  JiraConfig,
} from './jira';
import {RunMode, RunModeStreams, TeamStreamNames} from './streams/common';
import {FarosAuditEvents} from './streams/faros_audit_events';
import {FarosBoardIssues} from './streams/faros_board_issues';
import {FarosBoards} from './streams/faros_boards';
import {FarosIssueAdditionalFields} from './streams/faros_issue_additional_fields';
import {FarosIssuePullRequests} from './streams/faros_issue_pull_requests';
import {FarosIssues} from './streams/faros_issues';
import {FarosProjectVersionIssues} from './streams/faros_project_version_issues';
import {FarosProjectVersions} from './streams/faros_project_versions';
import {FarosProjects} from './streams/faros_projects';
import {FarosSprintReports} from './streams/faros_sprint_reports';
import {FarosSprints} from './streams/faros_sprints';
import {FarosTeamMemberships} from './streams/faros_team_memberships';
import {FarosTeams} from './streams/faros_teams';
import {FarosUsers} from './streams/faros_users';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new JiraSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class JiraSource extends AirbyteSourceBase<JiraConfig> {
  get type(): string {
    return 'jira';
  }

  mode(config: JiraConfig): string | undefined {
    if (!config.url) {
      return undefined;
    }
    return config.url.match(JIRA_CLOUD_REGEX) != null ? 'cloud' : 'server';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: JiraConfig): Promise<[boolean, VError]> {
    try {
      // Validate custom_headers JSON format if provided
      if (config.custom_headers) {
        try {
          JSON.parse(config.custom_headers);
        } catch (error) {
          throw new VError('Invalid JSON format in custom_headers configuration');
        }
      }

      const jira = await Jira.instance(config, this.logger);
      const projectKeys = config.projects
        ? new Set(config.projects)
        : undefined;
      const projects = await jira.getProjects(projectKeys);
      if (!projects.length) {
        throw new VError(
          'Invalid credentials or provided credentials have no browseable project access.'
        );
      }
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  makeFarosClient(config: JiraConfig): FarosClient {
    return new FarosClient({
      url: config.api_url ?? DEFAULT_API_URL,
      apiKey: config.api_key,
    });
  }

  streams(config: JiraConfig): AirbyteStreamBase[] {
    let farosClient;
    if (config.api_key) {
      farosClient = this.makeFarosClient(config);
    }
    return [
      new FarosIssuePullRequests(config, this.logger, farosClient),
      new FarosSprintReports(config, this.logger, farosClient),
      new FarosBoardIssues(config, this.logger, farosClient),
      new FarosSprints(config, this.logger, farosClient),
      new FarosUsers(config, this.logger, farosClient),
      new FarosProjects(config, this.logger, farosClient),
      new FarosIssues(config, this.logger, farosClient),
      new FarosBoards(config, this.logger, farosClient),
      new FarosProjectVersions(config, this.logger, farosClient),
      new FarosProjectVersionIssues(config, this.logger, farosClient),
      new FarosTeams(config, this.logger, farosClient),
      new FarosTeamMemberships(config, this.logger, farosClient),
      new FarosIssueAdditionalFields(config, this.logger, farosClient),
      new FarosAuditEvents(config, this.logger, farosClient),
    ];
  }

  override async onBeforeRun(config: JiraConfig): Promise<JiraConfig> {
    // In general, we want to skip resets if using the tracker.
    // However, for the first run with the tracker we need to reset to ensure
    // the resulting state is in sync with the graph.  If we have a state, we
    // assume the state and graph are in sync and skip the reset.
    if (
      config.use_faros_board_issue_tracker &&
      config.faros_source_id &&
      config.api_key
    ) {
      const farosClient = this.makeFarosClient(config);
      try {
        const res: any = await farosClient.request(
          'GET',
          `/accounts/${config.faros_source_id}/state`
        );
        return {
          ...config,
          ...(res.state && {
            skip_reset_models: ['tms_TaskBoardRelationship'],
          }),
        };
      } catch (e: any) {
        this.logger.warn(
          `Unable to check existence of board issue state in Faros: ${e?.message}`
        );
      }
    }
    return config;
  }

  async onBeforeRead(
    config: JiraConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: JiraConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? RunMode.Full],
    ].filter(
      (streamName) =>
        config.run_mode !== RunMode.Custom ||
        !config.custom_streams?.length ||
        config.custom_streams.includes(streamName)
    );
    if (config.fetch_teams) {
      streamNames.push(...TeamStreamNames);
    }

    if (config.sync_audit_events) {
      streamNames.push('faros_audit_events');
    }
    // If use projects as boards is enabled, remove the boards and board issues stream.
    if (config.use_projects_as_boards) {
      streamNames.splice(streamNames.indexOf('faros_board_issues'), 1);
      streamNames.splice(streamNames.indexOf('faros_boards'), 1);
    }
    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );
    const requestedStreams = new Set(
      streams.map((stream) => stream.stream.name)
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
        requestedStreams,
        startDate,
        endDate,
      } as JiraConfig,
      catalog: {streams},
      state: newState,
    };
  }

  async onAfterRead(config: JiraConfig): Promise<void> {
    const instance = await Jira.instance(config, this.logger);
    const stats = instance.getClientStats();
    this.logger.debug(`Jira client call stats ${JSON.stringify(stats)}`);
  }
}
