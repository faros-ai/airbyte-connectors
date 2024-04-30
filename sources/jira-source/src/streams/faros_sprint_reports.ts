import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {SprintReport} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class FarosSprintReports extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprintReports.json');
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
    streamState?: StreamState
  ): AsyncGenerator<SprintReport> {
    const boardId = streamSlice.board;
    if (this.config.board_ids && !this.config.board_ids.includes(boardId)) {
      this.logger.info(
        `Skipped board with id ${boardId} not included in boardIds config`
      );
      return;
    }
    const jira = await Jira.instance(this.config, this.logger);
    const board = await jira.getBoard(boardId);
    if (board.type !== 'scrum') return;
    if (!board?.location?.projectKey) {
      this.logger.warn(
        `Skipped board ${boardId} with no project key associated`
      );
      return;
    }
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState[boardId]?.cutoff)
        : undefined;
    const sprints = this.supportsFarosClient()
      ? jira.getSprintsFromFarosGraph(
          boardId,
          this.farosClient,
          this.config.graph
        )
      : jira.getSprints(boardId);
    for await (const sprint of sprints) {
      const report = await jira.getSprintReport(sprint, boardId, updateRange);
      yield {
        ...report,
        projectKey: board.location.projectKey,
        boardId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: SprintReport
  ): StreamState {
    const board = latestRecord.boardId;
    const latestRecordCutoff = Utils.toDate(latestRecord.completedAt);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      board
    );
  }
}
