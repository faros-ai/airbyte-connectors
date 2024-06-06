import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
import {isNil} from 'lodash';
import moment from 'moment';

import {DEFAULT_CUTOFF_LAG_DAYS, JiraConfig} from '../jira';
import {ProjectBoardFilter} from '../project-board-filter';

export type ProjectStreamSlice = {
  project: string;
};

export type BoardStreamSlice = {
  board: string;
};

export type StreamState = {
  readonly [projectOrBoard: string]: {cutoff: number};
};

export enum RunMode {
  Full = 'Full',
  Minimum = 'Minimum',
  WebhookSupplement = 'WebhookSupplement',
  AdditionalFields = 'AdditionalFields',
}

export const FullStreamNames = [
  'faros_issue_pull_requests',
  'faros_sprint_reports',
  'faros_board_issues',
  'faros_sprints',
  'faros_users',
  'faros_projects',
  'faros_issues',
  'faros_boards',
  'faros_project_versions',
  'faros_project_version_issues',
];

export const MinimumStreamNames = [
  'faros_projects',
  'faros_boards',
  'faros_sprints',
  'faros_sprint_reports',
  'faros_issues',
  'faros_users',
];

export const WebhookSupplementStreamNames = [
  'faros_board_issues',
  'faros_sprint_reports',
  'faros_issue_pull_requests',
];

export const AdditionalFieldsStreamNames = ['faros_issue_additional_fields'];

export const TeamStreamNames = ['faros_teams', 'faros_team_memberships'];

export const RunModeStreams = {
  [RunMode.Full]: FullStreamNames,
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.WebhookSupplement]: WebhookSupplementStreamNames,
  [RunMode.AdditionalFields]: AdditionalFieldsStreamNames,
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly projectBoardFilter: ProjectBoardFilter;
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.projectBoardFilter = new ProjectBoardFilter(
      config,
      logger,
      farosClient
    );
  }

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    projectOrBoardKey: string
  ): StreamState {
    return StreamBase.calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      projectOrBoardKey,
      this.config.cutoff_lag_days ?? DEFAULT_CUTOFF_LAG_DAYS
    );
  }

  static calculateUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    projectOrBoardKey: string,
    cutoffLagDays: number
  ): StreamState {
    if (isNil(latestRecordCutoff)) {
      return currentStreamState;
    }

    const currentCutoff = Utils.toDate(
      currentStreamState?.[projectOrBoardKey]?.cutoff ?? 0
    );

    const adjustedLatestRecordCutoff = moment(latestRecordCutoff)
      .subtract(cutoffLagDays, 'days')
      .toDate();

    if (adjustedLatestRecordCutoff > currentCutoff) {
      const newState = {
        cutoff: adjustedLatestRecordCutoff.getTime(),
      };
      return {
        ...currentStreamState,
        [projectOrBoardKey]: newState,
      };
    }
    return currentStreamState;
  }

  protected supportsFarosClient(): boolean {
    return (
      this.config.run_mode === RunMode.WebhookSupplement && !!this.farosClient
    );
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    for (const project of await this.projectBoardFilter.getProjects()) {
      yield {project};
    }
  }
}

export abstract class StreamWithBoardSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<BoardStreamSlice> {
    for (const board of await this.projectBoardFilter.getBoards()) {
      yield {board};
    }
  }
}
