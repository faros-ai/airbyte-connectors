import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DEV_FIELD_NAME, Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {
  ProjectStreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosIssuePullRequests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssuePullRequests.json');
  }

  get primaryKey(): StreamKey | undefined {
    return undefined;
  }

  get cursorField(): string | string[] {
    return ['issue', 'updated'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<PullRequest> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState?.[projectKey]?.cutoff)
        : this.getUpdateRange();

    for await (const issue of jira.getIssues(
      new JqlBuilder()
        .withProject(projectKey)
        .withDateRange(updateRange)
        .build(),
      true,
      true,
      [DEV_FIELD_NAME]
    )) {
      for (const pullRequest of (await jira.getIssuePullRequests(issue)) ||
        []) {
        yield {
          issue: {
            key: issue.key,
            updated: issue.updated,
            project: projectKey,
          },
          ...pullRequest,
        };
      }
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: PullRequest
  ): StreamState {
    const projectKey = latestRecord.issue.project;
    const latestRecordCutoff = Utils.toDate(latestRecord.issue.updated);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      projectKey
    );
  }
}
