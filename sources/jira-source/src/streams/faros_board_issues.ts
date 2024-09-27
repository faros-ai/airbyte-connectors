import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {State} from 'faros-airbyte-cdk/lib/sources/state';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {BoardIssueTracker} from './board_issue_tracker';
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
    const tracker = await this.createBoardIssueTracker(boardId);
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    // Only fetch board issues updated since start of date range and not all issues on the board.
    const state = streamState?.earliestIssueUpdateTimestamp;
    const since = this.getFullSyncStartDate(state);

    // Adding parentheses to ensure the original board JQL is executed without ammendment but without any ORDER BY clause.
    // https://support.atlassian.com/jira-service-management-cloud/docs/jql-keywords/#AND
    const jql = `updated >= ${since.getTime()} AND ${this.wrapJql(boardJql)}`;
    this.logger.debug(`Fetching issues for board ${boardId} using JQL ${jql}`);
    try {
      for await (const issue of jira.getIssuesKeys(jql)) {
        const maybe = {
          key: issue,
          boardId,
        };
        if (tracker.isNewIssue(maybe)) {
          yield maybe;
        }
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
    for (const issue of tracker.deletedIssues()) {
      yield issue;
    }
    await this.updateBoardIssueState(tracker);
  }

  private async updateBoardIssueState(
    tracker: BoardIssueTracker
  ): Promise<void> {
    if (this.farosClient && this.config.faros_source_id) {
      this.logger.debug('Updating board issue state in Faros');
      try {
        const body = {
          state: State.compress(tracker.getState()).data,
        };
        await this.farosClient.request(
          'PUT',
          `/accounts/${this.config.faros_source_id}/state`,
          body
        );
      } catch (e: any) {
        this.logger.warn(
          `Unable to update board issue state in Faros: ${e?.message}`
        );
      }
    }
  }

  private async createBoardIssueTracker(
    boardId: string
  ): Promise<BoardIssueTracker> {
    let boardIssueState: any;
    if (this.farosClient && this.config.faros_source_id) {
      this.logger.debug('Loading board issue state from Faros');
      try {
        const res: any = await this.farosClient.request(
          'GET',
          `/accounts/${this.config.faros_source_id}/state`
        );
        boardIssueState = State.decompress({
          data: res.state,
          format: 'base64/gzip',
        });
      } catch (e: any) {
        this.logger.warn(
          `Unable to load board issue state from Faros: ${e?.message}`
        );
      }
    }
    return new BoardIssueTracker(boardIssueState, boardId);
  }

  getUpdatedState(currentStreamState: BoardIssuesState): BoardIssuesState {
    const configStartDate = this.config.startDate;
    const currentState =
      currentStreamState.earliestIssueUpdateTimestamp ?? Infinity;

    const earliestIssueUpdateTimestamp = Math.min(
      currentState,
      configStartDate.getTime()
    );

    return {earliestIssueUpdateTimestamp};
  }

  private wrapJql(jql: string): string {
    const orderByPattern = /\sORDER BY\s/i;
    const match = orderByPattern.exec(jql);

    if (match) {
      const orderByIndex = match.index;
      const queryBeforeOrderBy = jql.slice(0, orderByIndex);
      const orderByClause = jql.slice(orderByIndex);

      return `(${queryBeforeOrderBy.trim()})${orderByClause}`;
    }

    // If no "ORDER BY" found, just return the original query in brackets
    return `(${jql.trim()})`;
  }
}
