import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {Sprint} from '../models';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class FarosSprints extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprints.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'id';
  }

  get cursorField(): string | string[] {
    return ['closedAt'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BoardStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Sprint> {
    const boardId = streamSlice.board;
    const jira = await Jira.instance(this.config, this.logger);
    const board = await jira.getBoard(boardId);
    if (board.type !== 'scrum') return;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState[boardId]?.cutoff)
        : undefined;
    for await (const sprint of jira.getSprints(boardId, updateRange)) {
      yield {
        id: sprint.id,
        boardId,
        name: sprint.name,
        state: sprint.state,
        startedAt: Utils.toDate(sprint.startDate),
        endedAt: Utils.toDate(sprint.endDate),
        closedAt: Utils.toDate(sprint.completeDate),
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Sprint
  ): StreamState {
    const board = latestRecord.boardId;
    const latestRecordCutoff = Utils.toDate(latestRecord.closedAt);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      board
    );
  }
}
