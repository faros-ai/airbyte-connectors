import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {BoardStreamSlice, StreamWithBoardSlices} from './common';

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
    streamSlice?: BoardStreamSlice
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const boardId = streamSlice.board;
    const boardConfig = await jira.getBoardConfiguration(boardId);
    const boardJql = await jira.getBoardJQL(boardConfig.filter.id);
    // Jira Agile API GetConfiguration response type does not include key property
    // but, in practice, it is actually present
    const projectKey = boardConfig.location['key'];
    try {
      for await (const issue of jira.getIssues(
        new JqlBuilder(boardJql).withProject(projectKey).build(),
        true,
        false
      )) {
        yield {
          key: issue.key,
          boardId,
        };
      }
    } catch (err: any) {
      // https://github.com/MrRefactoring/jira.js/blob/master/src/clients/baseClient.ts#L138
      if (err?.status !== 400) {
        throw wrapApiError(err);
      }
      // FAI-5497: Log an error instead of failing feed if 400
      this.logger.warn(
        `Failed to sync project ${projectKey} due to invalid filter. Skipping.`
      );
    }
  }
}
