import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {Utils, wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {
  BoardIssuesState,
  BoardStreamSlice,
  StreamWithBoardSlices,
} from './common';

export class FarosBoardIssues extends StreamWithBoardSlices {
  get dependencies(): ReadonlyArray<string> {
    return ['faros_boards'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosBoardIssues.json');
  }

  get primaryKey(): StreamKey | undefined {
    return ['key', 'boardId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BoardStreamSlice,
    streamState?: BoardIssuesState
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardId = streamSlice.board;
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    // Only fetch board issues updated since start of date range and not all issues on the board.
    const state = streamState?.earliestIssueUpdateTimestamp;
    const since = this.getUpdateRange(state)[0];
    const jql = `updated >= ${since.getTime()} AND ${this.wrapJqlBeforeOrderBy(boardJql)}`;
    this.logger.debug(`Fetching issues for board ${boardId} using JQL ${jql}`);
    try {
      for await (const issue of jira.getIssuesKeys(jql)) {
        yield {
          key: issue.key,
          updated: issue.updated,
          boardId,
        };
      }
    } catch (err: any) {
      // https://github.com/MrRefactoring/jira.js/blob/master/src/clients/baseClient.ts#L138
      if (err?.status !== 400) {
        throw wrapApiError(err);
      }
      // FAI-5497: Log an error instead of failing stream if 400
      this.logger.warn(
        `Failed to sync board ${boardConfig.name} with id ${boardId} due to invalid filter. Skipping.`
      );
    }
  }

  getUpdatedState(
    currentStreamState: BoardIssuesState,
    latestRecord: IssueCompact
  ): BoardIssuesState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated ?? 0);
    const currentState =
      currentStreamState.earliestIssueUpdateTimestamp ?? Infinity;

    const earliestIssueUpdateTimestamp = Math.min(
      currentState,
      latestRecordCutoff.getTime()
    );

    return {earliestIssueUpdateTimestamp};
  }

  private wrapJqlBeforeOrderBy(jql: string): string {
    const orderByPattern = /\sORDER BY\s/i;
    const match = jql.match(orderByPattern);

    if (match) {
      const orderByIndex = match.index!;
      const queryBeforeOrderBy = jql.slice(0, orderByIndex);
      const orderByClause = jql.slice(orderByIndex);

      return `(${queryBeforeOrderBy.trim()})${orderByClause}`;
    }

    // If no "ORDER BY" found, just return the original query in brackets
    return `(${jql.trim()})`;
  }
}
