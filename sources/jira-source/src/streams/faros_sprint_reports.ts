import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {SprintReport} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_GRAPH, Jira} from '../jira';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class FarosSprintReports extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprintReports.json');
  }

  // The Sprint Report is board-specific
  // that is, it will only include issues that match your board's saved filter
  // https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-sprint-report
  get primaryKey(): StreamKey | undefined {
    return ['sprintId', 'boardId'];
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
        : this.getUpdateRange();

    const sprints = this.supportsFarosClient()
      ? jira.getSprintsFromFarosGraph(
          boardId,
          this.farosClient,
          this.config.graph ?? DEFAULT_GRAPH,
          updateRange?.[0]
        )
      : jira.getSprints(boardId, updateRange);
    for await (const sprint of await sprints) {
      const report = await jira.getSprintReport(sprint, boardId);
      if (!report) continue;
      yield report;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: SprintReport
  ): StreamState {
    const board = latestRecord.boardId;
    const latestRecordCutoff = Utils.toDate(latestRecord.completeDate);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      board
    );
  }
}
