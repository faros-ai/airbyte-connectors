import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueProjectVersion} from 'faros-airbyte-common/jira';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {StreamWithProjectSlices} from './common';

export class FarosProjectVersionIssues extends StreamWithProjectSlices {
  get dependencies(): ReadonlyArray<string> {
    return ['faros_project_versions'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjectVersionIssues.json');
  }

  get primaryKey(): StreamKey {
    return ['key'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<IssueProjectVersion> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;

    for (const version of await jira.getProjectVersions(projectKey)) {
      const releaseJQL = new JqlBuilder(`fixVersion = ${version.id}`).build();
      for await (const issue of jira.getIssuesKeys(releaseJQL)) {
        yield {key: issue, projectVersionId: version.id};
      }
    }
  }
}
