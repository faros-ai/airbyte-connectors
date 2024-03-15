import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import moment from 'moment/moment';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_CUTOFF_DAYS, DEFAULT_CUTOFF_LAG_DAYS, Jira} from '../jira';
import {SprintReport} from '../models';
import {
  BoardState,
  BoardStreamSlice,
  BoardStreamState,
  StreamWithBoardSlices,
} from './common';

export class SprintReports extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/sprintReports.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'id';
  }

  get cursorField(): string | string[] {
    return ['completedAt'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BoardStreamSlice,
    streamState?: BoardStreamState
  ): AsyncGenerator<SprintReport> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardId = streamSlice.board;
    const board = await jira.getBoard(boardId);
    if (this.config.boardIds && !this.config.boardIds.includes(boardId)) {
      this.logger.info(`Skipped board ${board.name} (id: ${boardId})`);
      return;
    }
    if (board.type !== 'scrum') return;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState[boardId]?.cutoff)
        : undefined;
    for await (const report of jira.getSprintReports(boardId, updateRange)) {
      yield {
        ...report,
        projectKey: board.location.projectKey,
        boardId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: BoardStreamState,
    latestRecord: SprintReport
  ): BoardStreamState {
    const board = latestRecord.boardId;
    const latestRecordCutoff = Utils.toDate(latestRecord.completedAt);
    const newCutoff = moment().utc().toDate();
    if (latestRecordCutoff > newCutoff) {
      const cutoffLag = moment
        .duration(this.config.cutoffLagDays || DEFAULT_CUTOFF_LAG_DAYS, 'days')
        .asMilliseconds();
      const newState: BoardState = {
        cutoff: Math.max(
          latestRecordCutoff.getTime(),
          newCutoff.getTime() - cutoffLag
        ),
      };
      return {
        ...currentStreamState,
        [board]: newState,
      };
    }
    return currentStreamState;
  }
}
