import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Project} from 'jira.js/out/version2/models';
import {Dictionary} from 'ts-essentials';

import {Jira, JiraConfig} from '../jira';
import {Issue} from '../models';
import {StreamSlice, StreamState} from './common';

export class BoardIssues extends AirbyteStreamBase {
  constructor(
    private readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issuePullRequests.json');
  }

  get primaryKey(): StreamKey | undefined {
    return ['issueKey', 'boardId'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    if (!this.config.projectKeys) {
      const jira = await Jira.instance(this.config, this.logger);
      for await (const project of jira.getProjects()) {
        yield {project: project.key};
      }
    }
    for (const project of this.config.projectKeys) {
      yield {project};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const jira = await Jira.instance(this.config, this.logger);
    let projectsByKey: Map<string, Project>;
    if (!this.config.projectKeys) {
      projectsByKey = await jira.getProjectsByKey();
    }
    const projectKeys = this.config.projectKeys ?? projectsByKey.keys();
    for (const projectKey of projectKeys) {
      if (!this.config.useBoardOwnership) continue;
      const project =
        projectsByKey?.get(projectKey) ?? (await jira.getProject(projectKey));
      for await (const board of jira.getBoards(project.id)) {
        const boardId = board.id.toString();
        const boardJql = await jira.getBoardJQL(boardId);
        for await (const issue of jira.getIssues(
          project.id,
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
  }
}
