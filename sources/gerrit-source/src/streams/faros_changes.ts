import {AirbyteLogger, AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GerritChange, GerritClient} from '../gerrit';
import {ChangesStreamState, GerritConfig} from '../types';

export class FarosChanges extends AirbyteStreamBase {
  constructor(
    private readonly config: GerritConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosChanges.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated';
  }

  get supportsIncremental(): boolean {
    return true;
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: ChangesStreamState
  ): AsyncGenerator<GerritChange> {
    const client = new GerritClient(this.config, this.logger);
    
    // Build query based on sync mode and state
    let query = 'status:open OR status:merged OR status:abandoned';
    
    if (syncMode === SyncMode.INCREMENTAL && streamState?.lastUpdated) {
      query += ` AND updated:>=${streamState.lastUpdated}`;
    } else {
      // Use date range from config
      const startDate = this.config.startDate?.toISOString().split('T')[0];
      if (startDate) {
        query += ` AND updated:>=${startDate}`;
      }
    }

    // Add project filter if specified
    if (this.config.projects?.length) {
      const projectQuery = this.config.projects
        .map(p => `project:${p}`)
        .join(' OR ');
      query = `(${query}) AND (${projectQuery})`;
    }

    this.logger.info(`Fetching changes with query: ${query}`);

    const additionalFields = [
      'LABELS',
      'DETAILED_ACCOUNTS',
      'DETAILED_LABELS',
      'CURRENT_REVISION',
      'ALL_REVISIONS',
      'CURRENT_COMMIT',
      'ALL_COMMITS',
      'CURRENT_FILES',
      'MESSAGES',
      'REVIEWER_UPDATES',
      'SUBMITTABLE',
      'CHECK',
      'COMMIT_FOOTERS',
      'PUSH_CERTIFICATES',
    ];

    let skip = 0;
    if (syncMode === SyncMode.INCREMENTAL && streamState?.project) {
      // Resume from last project if we were interrupted
      query += ` AND project:>=${streamState.project}`;
    }

    for await (const changeBatch of client.listChanges(query, {
      skip,
      additionalFields,
    })) {
      for (const change of changeBatch) {
        yield change;
      }
      skip += changeBatch.length;
    }
  }

  getUpdatedState(
    currentStreamState: ChangesStreamState,
    latestRecord: GerritChange
  ): ChangesStreamState {
    const currentUpdated = currentStreamState?.lastUpdated;
    const latestUpdated = latestRecord.updated;

    // Keep the most recent update timestamp
    if (!currentUpdated || latestUpdated > currentUpdated) {
      return {
        lastUpdated: latestUpdated,
        project: latestRecord.project,
      };
    }

    return currentStreamState;
  }
}