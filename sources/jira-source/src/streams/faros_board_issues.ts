import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {Issue} from '../models';
import {BoardStreamSlice, StreamState, StreamWithBoardSlices} from './common';

export class FarosBoardIssues extends StreamWithBoardSlices {
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
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardId = streamSlice.board;
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    // Jira Agile API GetConfiguration response type does not include key property
    const projectKey = (boardConfig.location as any)?.key;
    if (!projectKey) {
      this.logger.warn(`No project key found for board ${boardId}`);
      return;
    }
    for await (const issue of jira.getIssues(
      projectKey,
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
