import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosClient, wrapApiError} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Jira, JiraConfig} from '../jira';
import {StreamBase} from './common';

type AuditEventState = {
  cutoff?: string; // ISO date string of last sync
};

export class FarosAuditEvents extends StreamBase {
  constructor(
    protected readonly config: JiraConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosAuditEvents.json');
  }

  get primaryKey(): StreamKey {
    return ['key'];
  }

  get supportsIncremental(): boolean {
    return true;
  }

  getUpdatedState(
    currentStreamState: AuditEventState,
    latestRecord: any
  ): AuditEventState {
    const recordDate = latestRecord?.created;
    if (!recordDate) {
      return currentStreamState;
    }

    const currentCutoff = currentStreamState?.cutoff;
    if (!currentCutoff || recordDate > currentCutoff) {
      return { cutoff: recordDate };
    }

    return currentStreamState;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: AuditEventState
  ): AsyncGenerator<any> {
    const jira = await Jira.instance(this.config, this.logger);

    // Get the projects that are being synced
    const projects = await this.projectBoardFilter.getProjects();
    const syncedProjectKeys = new Set(
      projects.filter(p => p.issueSync).map(p => p.uid)
    );

    // Get the date range using the standard method
    const cutoff = streamState?.cutoff ? new Date(streamState.cutoff).getTime() : undefined;
    const updateRange =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(cutoff)
        : this.getUpdateRange();

    const [fromDate, toDate] = updateRange;
    this.logger.info(`Syncing audit events from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    try {
      // Fetch audit records with filter for deleted issues
      for await (const record of jira.getAuditRecords(fromDate, toDate, 'deleted issue')) {
        // Only process issue deletion events
        if (record.objectItem?.typeName === 'ISSUE_DELETE') {
          const issueKey = record.objectItem.name;
          // Extract project key from issue key (e.g., "MKT-457" -> "MKT")
          const projectKey = issueKey.split('-')[0];

          // Only yield deletion events for projects that are being synced
          if (syncedProjectKeys.has(projectKey)) {
            yield {
              key: issueKey,
              isDeleted: true,
            };
          }
        }
      }
    } catch (err: any) {
      // Handle cases where audit API is not available
      if (err?.status === 403 || err?.status === 404) {
        this.logger.warn(
          `Fetching Audit events failed with status ${err.status}, code ${err.code}. Ensure you have correct Administer Jira (manage:jira-configuration) permissions.`
        );
        return;
      }
      throw wrapApiError(err);
    }
  }
}