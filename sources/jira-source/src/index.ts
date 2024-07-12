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
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {DEFAULT_API_URL, DEFAULT_CUTOFF_DAYS, Jira, JiraConfig} from './jira';
import {RunMode, RunModeStreams, TeamStreamNames} from './streams/common';
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

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: JiraConfig): Promise<[boolean, VError]> {
    try {
      await Jira.instance(config, this.logger);
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
      new FarosSprints(config, this.logger),
      new FarosUsers(config, this.logger),
      new FarosProjects(config, this.logger),
      new FarosIssues(config, this.logger),
      new FarosBoards(config, this.logger),
      new FarosProjectVersions(config, this.logger),
      new FarosProjectVersionIssues(config, this.logger),
      new FarosTeams(config, this.logger),
      new FarosTeamMemberships(config, this.logger),
      new FarosIssueAdditionalFields(config, this.logger, farosClient),
    ];
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
    const streamNames = [...RunModeStreams[config.run_mode ?? RunMode.Full]];
    if (config.fetch_teams) {
      streamNames.push(...TeamStreamNames);
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

    let {excluded_projects, excluded_boards} = config;
    if (config.projects?.length && excluded_projects?.length) {
      this.logger.warn(
        'Both projects and excluded_projects are specified, excluded_projects will be ignored.'
      );
      excluded_projects = undefined;
    }

    if (config.boards?.length && excluded_boards?.length) {
      this.logger.warn(
        'Both boards and excluded_boards are specified, excluded_boards will be ignored.'
      );
      excluded_boards = undefined;
    }

    return {
      config: {
        ...config,
        requestedStreams,
        startDate,
        endDate,
        excluded_projects,
        excluded_boards,
      },
      catalog: {streams},
      state,
    };
  }

  async onAfterRead(config: JiraConfig): Promise<void> {
    const instance = await Jira.instance(config, this.logger);
    const stats = instance.getClientStats();
    this.logger.debug(`Jira client call stats ${JSON.stringify(stats)}`);
  }
}
