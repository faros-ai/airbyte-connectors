import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
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

export abstract class StreamBase extends AirbyteStreamBase {
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger
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
          .subtract(this.config.cutoffDays || DEFAULT_CUTOFF_DAYS, 'days')
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
        .duration(this.config.cutoffLagDays || DEFAULT_CUTOFF_LAG_DAYS, 'days')
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
}

export abstract class StreamWithProjectSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ProjectStreamSlice> {
    if (!this.config.projectKeys) {
      const jira = await Jira.instance(this.config, this.logger);
      for await (const project of jira.getProjects()) {
        yield {project: project.key};
      }
    } else {
      for (const project of this.config.projectKeys) {
        yield {project};
      }
    }
  }
}

export abstract class StreamWithBoardSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<BoardStreamSlice> {
    if (!this.config.boardIds) {
      const jira = await Jira.instance(this.config, this.logger);
      for await (const board of jira.getBoards()) {
        yield {board: board.id.toString()};
      }
    } else {
      for (const board of this.config.boardIds) {
        yield {board};
      }
    }
  }
}
