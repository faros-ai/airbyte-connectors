import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Issue} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {omit} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {
  ProjectStreamSlice,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosIssues extends StreamWithProjectSlices {
  projectKey: string;

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssues.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'key';
  }

  get cursorField(): string | string[] {
    return ['updated'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const jira = await Jira.instance(this.config, this.logger);
    this.projectKey = streamSlice?.project;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(streamState?.[this.projectKey]?.cutoff)
        : undefined;
    for await (const issue of jira.getIssues(
      new JqlBuilder()
        .withProject(this.projectKey)
        .withDateRange(updateRange)
        .build()
    )) {
      yield omit(issue as Issue, 'fields');
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      this.projectKey
    );
  }
}
