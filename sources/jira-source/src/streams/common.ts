import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import moment from 'moment';

import {DEFAULT_CUTOFF_DAYS, Jira, JiraConfig} from '../jira';

export type ProjectStreamSlice = {
  project: string;
};

export type BoardStreamSlice = {
  board: string;
};

export type ProjectStreamState = {
  readonly [project: string]: ProjectState;
};

export interface ProjectState {
  readonly issueCutoff?: number;
}

export type BoardStreamState = {
  readonly [board: string]: BoardState;
};

export interface BoardState {
  readonly cutoff?: number;
}

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
