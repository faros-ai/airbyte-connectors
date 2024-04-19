import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import * as fs from 'fs';
import path from 'path';
import {Dictionary} from 'ts-essentials';

import {DEV_FIELD_NAME, Jira} from '../jira';
import {PullRequest} from '../models';
import {
  ProjectStreamSlice,
  RunMode,
  StreamState,
  StreamWithProjectSlices,
} from './common';

const TASKS_QUERY = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'queries', 'tms-task.gql'),
  'utf8'
);

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
        : undefined;
    // if mode is WebhookSupplement, we fetch issues from the graph and then we will fetch pull requests
    if (
      this.config.run_mode === RunMode.WebhookSupplement &&
      this.farosClient
    ) {
      // fetch issues from Faros graph
      const issues = await this.farosClient.gql(
        this.config.graph,
        TASKS_QUERY,
        {
          source: 'Jira',
          project: projectKey,
          updatedAt: updateRange[0],
        }
      );
    }
    for await (const issue of jira.getIssues(
      projectKey,
      true,
      updateRange,
      true,
      undefined,
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
