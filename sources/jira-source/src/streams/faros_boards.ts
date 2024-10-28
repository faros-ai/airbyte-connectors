import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Board} from 'faros-airbyte-common/jira';
import {pick, toString} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamWithProjectSlices} from './common';

export class FarosBoards extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosBoards.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Board> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;

    // Virtual board to represent all tasks in the project without a board
    yield {
      uid: `faros-tasks-with-no-board-${projectKey}`,
      name: `Tasks without a board in project ${projectKey}`,
      projectKey,
      type: 'Custom',
      issueSync: false,
    };

    for (const board of await jira.getProjectBoards(projectKey)) {
      const boardId = toString(board.id);
      const {included, syncIssues} =
        await this.projectBoardFilter.getBoardInclusion(boardId);
      if (included) {
        yield {
          ...pick(board, ['id', 'name', 'type']),
          uid: boardId,
          projectKey,
          issueSync: syncIssues,
        };
      }
    }
  }
}
