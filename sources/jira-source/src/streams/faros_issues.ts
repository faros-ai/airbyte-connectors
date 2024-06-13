import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Issue, IssueCompact} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {omit, xor} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {JqlBuilder} from '../jql-builder';
import {
  IssueStreamState,
  ProjectStreamSlice,
  StreamWithProjectSlices,
} from './common';

export class FarosIssues extends StreamWithProjectSlices {
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
    streamState?: IssueStreamState
  ): AsyncGenerator<Issue | IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const projectState = streamState?.[projectKey];
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(projectState?.cutoff)
        : this.getUpdateRange();

    if (
      projectState &&
      xor(projectState.additionalFields, this.config.additional_fields ?? [])
        .length > 0
    ) {
      yield* this.getPreviousIssuesAdditionalFields(streamSlice, streamState);
    }

    for await (const issue of jira.getIssues(
      new JqlBuilder()
        .withProject(projectKey)
        .withDateRange(updateRange)
        .build()
    )) {
      yield omit(issue, 'fields');
    }
  }

  private async *getPreviousIssuesAdditionalFields(
    streamSlice?: ProjectStreamSlice,
    streamState?: IssueStreamState
  ): AsyncGenerator<IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const projectState = streamState?.[projectKey];
    const from = new Date(projectState.oldestIssueTimestamp);
    const to = new Date(projectState.cutoff);

    this.logger.info(
      `Refetching additional fields for issues in project ${projectKey} from ${from} to ${to}, since additional fields have changed.`
    );

    for await (const issue of jira.getIssueCompactWithAdditionalFields(
      new JqlBuilder().withProject(projectKey).withDateRange([from, to]).build()
    )) {
      yield {...issue, updateAdditionalFields: true};
    }
  }

  getUpdatedState(
    currentStreamState: IssueStreamState,
    latestRecord: Issue,
    slice: ProjectStreamSlice
  ): IssueStreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated ?? 0);
    const updatedState = this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      slice.project
    );
    const currentOldestTimestamp =
      currentStreamState?.[slice.project]?.oldestIssueTimestamp;
    const oldestIssueTimestamp = Math.min(
      currentOldestTimestamp || Infinity,
      latestRecordCutoff.getTime()
    );
    return {
      ...updatedState,
      [slice.project]: {
        ...updatedState[slice.project],
        additionalFields: this.config.additional_fields ?? [],
        oldestIssueTimestamp,
      },
    };
  }
}
