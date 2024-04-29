import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {SprintReport} from '../models';
import {
  BoardStreamSlice,
  RunMode,
  StreamState,
  StreamWithBoardSlices,
} from './common';

export class FarosSprintReports extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprintReports.json');
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
  ): AsyncGenerator<SprintReport> {
    const boardId = streamSlice.board;
    const jira = await Jira.instance(this.config, this.logger);
    const board = await jira.getBoard(boardId);
    if (board.type !== 'scrum') return;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState[boardId]?.cutoff)
        : undefined;
    const sprints = this.supportsFarosClient()
      ? jira.getSprintsFromFarosGraph(
          boardId,
          this.farosClient,
          this.config.graph,
          updateRange?.[0]
        )
      : jira.getSprints(boardId, updateRange);
    const includeIssues = this.config.run_mode !== RunMode.WebhookSupplement;
    for await (const sprint of sprints) {
      const report = await jira.getSprintReport(sprint, boardId, includeIssues);
      if (!report) continue;
      yield {
        ...report,
        boardId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: SprintReport
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
