import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {
  BoardIssues,
  BoardIssuesState,
  BoardStreamSlice,
  StreamWithBoardSlices,
} from './common';

class BoardIssueTracker {
  private readonly seenIssues: Set<string> = new Set();
  private readonly existingIssues: Set<string> = new Set();

  constructor(
    state: BoardIssuesState,
    private readonly boardId: string
  ) {
    if (boardId in (state.boardIssues ?? {})) {
      state.boardIssues.boardId.forEach((issue) => {
        console.log(`adding existing issue: ${issue}`);
        this.existingIssues.add(issue);
      });
    }
  }

  /**
   * Tracks issues for a board.
   * Reconciles prior state with new state by adding or deleting issues.
   * Returns true if the issue has not been seen before.
   * @param issue
   */
  trackIssue(issue: IssueCompact): boolean {
    this.seenIssues.add(issue.key);
    return !this.existingIssues.has(issue.key);
  }

  deletedIssues(): IssueCompact[] {
    return Array.from(this.existingIssues)
      .filter((key) => !this.seenIssues.has(key))
      .map((key) => {
        return {key, boardId: this.boardId, isDeleted: true};
      });
  }

  boardIssues(): BoardIssues {
    return {[this.boardId]: Array.from(this.seenIssues.values())};
  }
}

export class FarosBoardIssues extends StreamWithBoardSlices {
  private boardIssues: BoardIssues | undefined;

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
    const tracker = new BoardIssueTracker(streamState, boardId);
    // reset for each board
    this.boardIssues = undefined;
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    // Only fetch board issues updated since start of date range and not all issues on the board.
    const state = streamState?.earliestIssueUpdateTimestamp;
    const since = this.getUpdateRange(state)[0];

    // Adding parentheses to ensure the original board JQL is executed without ammendment but without any ORDER BY clause.
    // https://support.atlassian.com/jira-service-management-cloud/docs/jql-keywords/#AND
    const jql = `updated >= ${since.getTime()} AND ${this.wrapJql(boardJql)}`;
    this.logger.debug(`Fetching issues for board ${boardId} using JQL ${jql}`);
    let last: IssueCompact | undefined;
    try {
      for await (const issue of jira.getIssuesKeys(jql)) {
        if (last) {
          yield last;
        }
        const maybe = {
          key: issue,
          boardId,
        };
        if (tracker.trackIssue(maybe)) {
          last = maybe;
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
    if (last) {
      this.boardIssues = tracker.boardIssues();
      yield last;
    }
  }

  getUpdatedState(currentStreamState: BoardIssuesState): BoardIssuesState {
    const configStartDate = this.config.startDate;
    const currentState =
      currentStreamState.earliestIssueUpdateTimestamp ?? Infinity;

    const earliestIssueUpdateTimestamp = Math.min(
      currentState,
      configStartDate.getTime()
    );

    return {
      earliestIssueUpdateTimestamp,
      boardIssues: {
        ...currentStreamState.boardIssues,
        ...this.boardIssues,
      },
    };
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
