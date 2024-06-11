import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Issue, IssueCompact} from 'faros-airbyte-common/jira';
import {Utils} from 'faros-js-client';
import {isEqual, omit} from 'lodash';
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
  oldestIssueTimestamp: number;

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
  ): AsyncGenerator<Issue | IssueCompact> {
    const jira = await Jira.instance(this.config, this.logger);
    this.projectKey = streamSlice?.project;
    const projectState = streamState?.[this.projectKey];
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(projectState?.cutoff)
        : this.getUpdateRange();

    this.oldestIssueTimestamp = Math.min(
      projectState?.oldestIssueTimestamp || Infinity,
      updateRange[0].getTime()
    );

    // If additional fields have been updated, fetch additional fields for all issues before current update range
    if (
      projectState?.additionalFields?.length &&
      this.oldestIssueTimestamp &&
      this.config.sync_additional_fields &&
      this.config.additional_fields.length &&
      !isEqual(projectState?.additionalFields, this.config.additional_fields)
    ) {
      yield* this.getPreviousIssuesAdditionalFields(
        new Date(this.oldestIssueTimestamp),
        updateRange[0],
        jira
      );
    }

    for await (const issue of jira.getIssues(
      new JqlBuilder()
        .withProject(this.projectKey)
        .withDateRange(updateRange)
        .build()
    )) {
      yield omit(issue, 'fields');
    }
  }

  private async *getPreviousIssuesAdditionalFields(
    startDate: Date,
    endDate: Date,
    jira: Jira
  ): AsyncGenerator<IssueCompact> {
    this.logger.info(
      `Additional fields have been updated for project ${this.projectKey}. Fetching additional fields for older issues.`
    );
    for await (const issue of jira.getIssueCompactWithAdditionalFields(
      new JqlBuilder()
        .withProject(this.projectKey)
        .withDateRange([startDate, endDate])
        .build()
    )) {
      yield {...issue, updateAdditionalFields: true};
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated ?? 0);
    const updatedState = this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      this.projectKey
    );
    return {
      ...updatedState,
      [this.projectKey]: {
        ...updatedState[this.projectKey],
        additionalFields: this.config.additional_fields,
        oldestIssueTimestamp: this.oldestIssueTimestamp,
      },
    };
  }
}
