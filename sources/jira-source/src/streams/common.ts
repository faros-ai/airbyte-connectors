import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {FarosClient} from 'faros-js-client';
import moment from 'moment';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_CUTOFF_LAG_DAYS,
  Jira,
  JiraConfig,
} from '../jira';

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
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
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
      currentStreamState?.[projectOrBoardKey]?.cutoff
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
    const jira = await Jira.instance(this.config, this.logger);
    if (!this.config.project_keys) {
      const projects = this.supportsFarosClient()
        ? jira.getProjectsFromGraph(this.farosClient, this.config.graph)
        : jira.getProjects();
      for await (const project of projects) {
        yield {project: project.key};
      }
    } else {
      for (const project of this.config.project_keys) {
        if (jira.isProjectInBucket(project)) yield {project};
      }
    }
  }
}

export abstract class StreamWithBoardSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<BoardStreamSlice> {
    const jira = await Jira.instance(this.config, this.logger);
    if (!this.config.board_ids) {
      const boards = this.supportsFarosClient()
        ? jira.getBoardsFromGraph(this.farosClient, this.config.graph)
        : jira.getBoards();
      for await (const board of boards) {
        yield {board: board.id.toString()};
      }
    } else {
      for (const board of this.config.board_ids) {
        if (await jira.isBoardInBucket(board)) yield {board};
      }
    }
  }
}
