import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
import moment from 'moment';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_CUTOFF_LAG_DAYS,
  JiraConfig,
} from '../jira';
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
  WebhookSupplement = 'WebhookSupplement',
}

export const WebhookSupplementStreamNames = [
  'faros_board_issues',
  'faros_sprint_reports',
  'faros_issue_pull_requests',
];

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
    const newCutoff = moment().utc().toDate();
    // If no state with cutoff, use the default one applying cutoffDays
    const fromCutoff = cutoff
      ? Utils.toDate(cutoff)
      : moment()
          .utc()
          .subtract(this.config.cutoff_days || DEFAULT_CUTOFF_DAYS, 'days')
          .toDate();
    return [fromCutoff, newCutoff];
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    projectOrBoardKey: string
  ): StreamState {
    const currentCutoff = Utils.toDate(
      currentStreamState?.[projectOrBoardKey]?.cutoff ?? 0
    );
    if (latestRecordCutoff > currentCutoff) {
      const newCutoff = moment().utc().toDate();
      const cutoffLag = moment
        .duration(
          this.config.cutoff_lag_days || DEFAULT_CUTOFF_LAG_DAYS,
          'days'
        )
        .asMilliseconds();
      const newState = {
        cutoff: Math.max(
          latestRecordCutoff.getTime(),
          newCutoff.getTime() - cutoffLag
        ),
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
