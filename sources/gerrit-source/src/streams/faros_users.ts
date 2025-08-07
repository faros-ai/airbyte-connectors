import {AirbyteLogger, AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GerritAccount, GerritClient} from '../gerrit';
import {GerritConfig, StreamState} from '../types';

export class FarosUsers extends AirbyteStreamBase {
  private collectedUsers = new Set<number>();

  constructor(
    private readonly config: GerritConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return '_account_id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: any,
    streamState?: StreamState
  ): AsyncGenerator<GerritAccount> {
    const client = new GerritClient(this.config, this.logger);
    
    // Gerrit doesn't have a good way to list all users, so we'll collect users
    // from changes instead. This requires reading changes first.
    
    // First, get users from recent changes
    let query = 'status:open OR status:merged OR status:abandoned';
    
    // Use date range from config to limit the scope
    const startDate = this.config.startDate?.toISOString().split('T')[0];
    if (startDate) {
      query += ` AND updated:>=${startDate}`;
    }

    // Add project filter if specified
    if (this.config.projects?.length) {
      const projectQuery = this.config.projects
        .map(p => `project:${p}`)
        .join(' OR ');
      query = `(${query}) AND (${projectQuery})`;
    }

    this.logger.info('Collecting users from changes');

    for await (const changeBatch of client.listChanges(query, {
      additionalFields: ['DETAILED_ACCOUNTS'],
    })) {
      for (const change of changeBatch) {
        // Collect owner
        if (change.owner && !this.collectedUsers.has(change.owner._account_id)) {
          this.collectedUsers.add(change.owner._account_id);
          yield change.owner;
        }

        // Collect submitter
        if (change.submitter && !this.collectedUsers.has(change.submitter._account_id)) {
          this.collectedUsers.add(change.submitter._account_id);
          yield change.submitter;
        }

        // Collect reviewers from labels
        if (change.labels) {
          for (const label of Object.values(change.labels)) {
            if (label.all) {
              for (const approval of label.all) {
                if (approval._account_id && !this.collectedUsers.has(approval._account_id)) {
                  this.collectedUsers.add(approval._account_id);
                  yield {
                    _account_id: approval._account_id,
                    name: approval.name,
                    email: approval.email,
                    username: approval.username,
                  };
                }
              }
            }
          }
        }
      }
    }

    // Additionally, we can search for active users if needed
    // This is limited but can help find more users
    const additionalQueries = [
      'is:active',
      'can:viewqueue',
    ];

    for (const searchQuery of additionalQueries) {
      try {
        for await (const userBatch of client.listAccounts(searchQuery)) {
          for (const user of userBatch) {
            if (!this.collectedUsers.has(user._account_id)) {
              this.collectedUsers.add(user._account_id);
              yield user;
            }
          }
        }
      } catch (error) {
        // Some queries might fail due to permissions
        this.logger.warn(`Failed to search users with query "${searchQuery}": ${error.message}`);
      }
    }

    this.logger.info(`Collected ${this.collectedUsers.size} unique users`);
  }
}