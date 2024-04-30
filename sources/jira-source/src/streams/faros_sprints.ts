import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {AgileModels} from 'jira.js';
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
  ): AsyncGenerator<AgileModels.Sprint> {
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
        originBoardId: sprint.originBoardId ?? toInteger(boardId),
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        completeDate: sprint.completeDate,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AgileModels.Sprint
  ): StreamState {
    const board = toString(latestRecord.originBoardId);
    const latestRecordCutoff = Utils.toDate(latestRecord.completeDate);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      board
    );
  }
}
