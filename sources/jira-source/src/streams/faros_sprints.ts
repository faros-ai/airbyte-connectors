import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Sprint} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {toInteger, toString} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class FarosSprints extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprints.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'id';
  }

  get cursorField(): string | string[] {
    return ['completeDate'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BoardStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Sprint> {
    const boardId = streamSlice.board;
    const jira = await Jira.instance(this.config, this.logger);
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState[boardId]?.cutoff)
        : this.getUpdateRange();

    if (this.config.use_projects_as_boards) {
      // If the use_projects_as_boards is true, boardId is actually a project key.
      const projectKey = boardId;
      const boards = await jira.getProjectBoards(projectKey);
      for (const board of boards) {
        if (board.type !== 'scrum') continue;
        yield* this.processBoardSprints(
          jira,
          toString(board.id),
          updateRange,
          projectKey
        );
      }
    } else {
      const board = await jira.getBoard(boardId);
      if (board.type !== 'scrum') return;
      yield* this.processBoardSprints(jira, boardId, updateRange);
    }
  }

  private async *processBoardSprints(
    jira: Jira,
    boardId: string,
    updateRange: [Date | undefined, Date | undefined],
    projectKey?: string
  ): AsyncGenerator<Sprint> {
    for (const sprint of await jira.getSprints(boardId, updateRange)) {
      yield {
        id: sprint.id,
        originBoardId: sprint.originBoardId,
        name: sprint.name,
        goal: sprint.goal,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        completeDate: sprint.completeDate,
        activatedDate: sprint['activatedDate'],
        boardId: toInteger(boardId),
        ...(projectKey ? {projectKey} : {}),
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Sprint
  ): StreamState {
    const board = toString(latestRecord.boardId);
    const latestRecordCutoff = Utils.toDate(latestRecord.completeDate);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      board
    );
  }
}
