import {Data, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {BoardIssueTracker, BoardIssueTrackerState} from './board_issue_tracker';
import {
  BoardIssuesState,
  BoardStreamSlice,
  StreamWithBoardSlices,
} from './common';

export class FarosBoardIssues extends StreamWithBoardSlices {
  private boardIssueTrackerState: BoardIssueTrackerState | undefined;
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
    const tracker = new BoardIssueTracker(this.boardIssueTrackerState, boardId);
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
    this.boardIssueTrackerState = tracker.getState();
  }

  override async onBeforeRead(): Promise<void> {
    this.boardIssueTrackerState = await this.loadBoardIssueTrackerState();
  }

  override async onAfterRead(): Promise<void> {
    await this.updateBoardIssueTrackerState(this.boardIssueTrackerState);
  }

  private async updateBoardIssueTrackerState(
    state: BoardIssueTrackerState
  ): Promise<void> {
    if (
      this.config.use_faros_board_issue_tracker &&
      this.farosClient &&
      this.config.faros_source_id
    ) {
      this.logger.info('Updating board issue state in Faros');
      try {
        const body = {
          state: Data.compress(state).data,
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

  private async loadBoardIssueTrackerState(): Promise<
    BoardIssueTrackerState | undefined
  > {
    if (
      this.config.use_faros_board_issue_tracker &&
      this.farosClient &&
      this.config.faros_source_id
    ) {
      this.logger.info('Loading board issue state from Faros');
      try {
        const res: any = await this.farosClient.request(
          'GET',
          `/accounts/${this.config.faros_source_id}/state`
        );
        return Data.decompress({
          data: res.state,
          format: 'base64/gzip',
        }) as BoardIssueTrackerState;
      } catch (e: any) {
        this.logger.warn(
          `Unable to load board issue state from Faros: ${e?.message}`
        );
      }
    }
    return undefined;
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
