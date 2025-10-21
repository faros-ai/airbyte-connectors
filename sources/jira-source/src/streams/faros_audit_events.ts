import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils, wrapApiError} from 'faros-js-client';
import {AuditRecord} from 'jira.js/out/version2/models';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {ProjectStreamSlice, StreamState, StreamWithProjectSlices} from './common';

export class FarosAuditEvents extends StreamWithProjectSlices {

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosAuditEvents.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  get cursorField(): string | string[] {
    return ['created'];
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: AuditRecord,
    streamSlice?: ProjectStreamSlice
  ): StreamState {
    const recordDate = Utils.toDate(latestRecord?.created);
    if (!recordDate || !streamSlice?.project) {
      return currentStreamState;
    }

    return this.getUpdatedStreamState(
      recordDate,
      currentStreamState,
      streamSlice.project
    );
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<AuditRecord> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKey = streamSlice?.project;
    const projectState = streamState?.[projectKey];
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(projectState?.cutoff)
        : this.getUpdateRange();

    const [fromDate, toDate] = updateRange;

    try {
      for await (const record of jira.getAuditRecords(
        fromDate,
        toDate,
        // Only fetch and process issue deletion events for this project
        `deleted issue ${projectKey}-`
      )) {
        if (record.objectItem?.typeName === 'ISSUE_DELETE') {
          const issueKey = record.objectItem.name;
          // Only yield deletion events for the current project slice
          // API will return partial matches so need explicit filter
          const recordProjectKey = issueKey?.split('-')[0];
          if (recordProjectKey === projectKey) {
            yield record;
          }
        }
      }
    } catch (err: any) {
      // Handle cases where audit API is not available
      if (err?.status === 403 || err?.status === 404) {
        this.logger.warn(
          `Fetching Audit events failed with status ${err.status}, ` +
            `code ${err.code}. Ensure you have correct Administer Jira ` +
            `(manage:jira-configuration) permissions.`
        );
        return;
      }
      throw wrapApiError(err);
    }
  }
}
