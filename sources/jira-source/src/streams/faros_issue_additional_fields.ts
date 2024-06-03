import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {IssueCompact} from 'faros-airbyte-common/jira';
import {isEqual, omit} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {DEFAULT_GRAPH, Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {
  ProjectStreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosIssueAdditionalFields extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssueAdditionalFields.json');
  }

  get primaryKey(): StreamKey | undefined {
    return ['key'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const updateRange = this.getUpdateRange();
    const farosIssues = await jira.getIssuesFromFarosGraph(
      this.farosClient,
      this.config.graph ?? DEFAULT_GRAPH,
      updateRange,
      projectKey
    );
    const jiraIssues = jira.getIssueCompactWithAdditionalFields(
      new JqlBuilder()
        .withProject(projectKey)
        .withDateRange(updateRange)
        .build()
    );
    for await (const issue of jiraIssues) {
      const farosIssue = farosIssues.find(
        (farosIssue) => farosIssue.key === issue.key
      );
      if (farosIssue && farosIssue?.additionalFields?.length) {
        // If the additional fields are different we want to yield the issue to update them
        const farosFieldNames = farosIssue.additionalFields
          .map((field) => field.name)
          .sort();
        const jiraFieldNames = issue.additionalFields
          .map((field) => field[0])
          .sort();
        if (!isEqual(farosFieldNames, jiraFieldNames)) {
          yield omit(issue, 'fields');
        }
      }
    }
  }
}
