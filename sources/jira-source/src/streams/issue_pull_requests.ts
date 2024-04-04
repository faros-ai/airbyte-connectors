import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DEV_FIELD_NAME, Jira} from '../jira';
import {PullRequest} from '../models';
import {
  ProjectStreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class IssuePullRequests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issuePullRequests.json');
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
        : undefined;
    for await (const issue of jira.getIssues(
      projectKey,
      true,
      updateRange,
      true,
      true,
      [DEV_FIELD_NAME]
    )) {
      for (const pullRequest of issue.pullRequests || []) {
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
