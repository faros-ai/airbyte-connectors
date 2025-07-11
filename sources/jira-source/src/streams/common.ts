import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_CUTOFF_LAG_DAYS, JiraConfig} from '../jira';
import {ProjectBoardFilter} from '../project-board-filter';
import {ProjectFilter} from '../project-filter';

export type ProjectStreamSlice = {
  project: string;
};

export type BoardStreamSlice = {
  board: string;
};

export type StreamState = {
  readonly [projectOrBoard: string]: {
    cutoff: number;
  };
};

export type IssueStreamState = {
  readonly [projectOrBoard: string]: {
    cutoff: number;
    additionalFields?: ReadonlyArray<string>;
    // The timestamp of the earliest issue update we've seen so far
    // This is how far back we need to go to update the additional fields for the issues we've already fetched
    earliestIssueUpdateTimestamp?: number;
  };
};

// Global state for the board issues stream to match earliest issue update timestamp
export type BoardIssuesState = {
  earliestIssueUpdateTimestamp: number;
};

export enum RunMode {
  Full = 'Full',
  Minimum = 'Minimum',
  WebhookSupplement = 'WebhookSupplement',
  AdditionalFields = 'AdditionalFields',
  Custom = 'Custom',
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

export const CustomStreamNames = [
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
  'faros_audit_events',
];

export const TeamStreamNames = ['faros_teams', 'faros_team_memberships'];

export const RunModeStreams = {
  [RunMode.Full]: FullStreamNames,
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.WebhookSupplement]: WebhookSupplementStreamNames,
  [RunMode.AdditionalFields]: AdditionalFieldsStreamNames,
  [RunMode.Custom]: CustomStreamNames,
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly projectBoardFilter: ProjectBoardFilter;
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.projectBoardFilter = this.useProjectsAsBoards()
      ? ProjectFilter.instance(config, logger, farosClient)
      : ProjectBoardFilter.instance(
          config,
          logger,
          farosClient,
          this.isWebhookSupplementMode()
        );
  }

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
  }

  /* Use this method to for full-sync streams with a static start date
   * that prefers the lesser date between state and config start date. Handles
   * where we backfill data from a date earlier than the initial sync date.
   */
  protected getFullSyncStartDate(cutoff?: number): Date {
    const start = this.getUpdateRange(cutoff)[0];
    return start < this.config.startDate ? start : this.config.startDate;
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    projectOrBoardKey: string
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      projectOrBoardKey,
      this.config.cutoff_lag_days ?? DEFAULT_CUTOFF_LAG_DAYS
    );
  }

  protected isWebhookSupplementMode(): boolean {
    return this.config.run_mode === RunMode.WebhookSupplement;
  }

  protected hasFarosClient(): boolean {
    return Boolean(this.farosClient);
  }

  protected useProjectsAsBoards(): boolean {
    return this.config.use_projects_as_boards ?? false;
  }
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    for (const project of await this.projectBoardFilter.getProjects()) {
      if (project.issueSync) {
        yield {project: project.uid};
      }
    }
  }
}

export abstract class StreamWithBoardSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<BoardStreamSlice> {
    for (const board of await this.projectBoardFilter.getBoards()) {
      if (board.issueSync) {
        yield {board: board.uid};
      }
    }
  }
}

export abstract class ProjectStreamSliceWithStaticCutoff extends StreamWithProjectSlices {
  /**
   * This method updates the cutoff date for full-sync project streams.
   * These streams use one cutoff across all slices.
   * In those cases, we should use the lesser date between the current state
   * and the config start date. This ensures changes to the start date
   * unless when doing a full reset does not result in the stream pulling less
   * data. Additionally, if we back-fill data from a date earlier than the
   * initial sync date and the start date is updated we should now pull data
   * from the new start date.
   */
  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Dictionary<any>
  ): StreamState {
    const currentCutoff = Utils.toDate(
      currentStreamState?.[latestRecord.projectKey]?.cutoff
    );
    if (!currentCutoff) {
      return {
        ...currentStreamState,
        [latestRecord.projectKey]: {
          cutoff: this.config.startDate.getTime(),
        },
      };
    }

    const adjustedLatestRecordCutoff = DateTime.fromJSDate(currentCutoff)
      .minus({days: this.config.cutoff_lag_days ?? DEFAULT_CUTOFF_LAG_DAYS})
      .toJSDate();

    if (adjustedLatestRecordCutoff < currentCutoff) {
      const newState = {
        cutoff: adjustedLatestRecordCutoff.getTime(),
      };
      return {
        ...currentStreamState,
        [latestRecord.projectKey]: newState,
      };
    }

    return currentStreamState;
  }
}
