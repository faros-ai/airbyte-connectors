import {StreamKey} from 'faros-airbyte-cdk';
type FarosUserOutput = any;
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {UserMapper} from '../types/internal';
import {StreamBase} from './common';

export class FarosUsers extends StreamBase {
  /**
   * Users stream depends on other streams to ensure users are collected
   * from various sources before emitting user records.
   */
  get dependencies(): ReadonlyArray<string> {
    return [
      'faros_issues',
      'faros_merge_requests',
      'faros_merge_request_reviews',
    ];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['group_id', 'id'];
  }

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by other incremental streams.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'web_url';
  }

  async *readRecords(): AsyncGenerator<FarosUserOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    for (const group of await this.groupFilter.getGroups()) {
      this.logger.info(`Fetching users for group ${group}`);
      await gitlab.fetchGroupMembers(group);
    }
    const users = gitlab.userCollector.getCollectedUsers();
    for (const user of users.values()) {
      yield UserMapper.toOutput(user);
    }
  }
}
