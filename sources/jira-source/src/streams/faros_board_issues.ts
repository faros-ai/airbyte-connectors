import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {BoardStreamSlice, StreamWithBoardSlices} from './common';

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
    streamSlice?: BoardStreamSlice
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardId = streamSlice.board;
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    try {
      for await (const issue of jira.getIssuesKeys(boardJql)) {
        yield {
          key: issue,
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
}
