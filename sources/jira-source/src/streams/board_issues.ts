import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {Issue} from '../models';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class BoardIssues extends StreamWithBoardSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issuePullRequests.json');
  }

  get primaryKey(): StreamKey | undefined {
    return ['key', 'boardId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: BoardStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const boardId = streamSlice.board;
    if (this.config.board_ids && !this.config.board_ids.includes(boardId)) {
      this.logger.info(`Skipped board with id ${boardId}`);
      return;
    }
    const jira = await Jira.instance(this.config, this.logger);
    const boardJql = await jira.getBoardJQL(boardId);
    const board = await jira.getBoard(boardId);
    for await (const issue of jira.getIssues(
      board.location.projectKey,
      false,
      undefined,
      true,
      boardJql,
      false
    )) {
      yield {
        key: issue.key,
        boardId,
      };
    }
  }
}
