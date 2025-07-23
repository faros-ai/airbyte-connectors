import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AccountInfo} from '../types';
import {StreamBase} from './stream_base';

export class FarosAccounts extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosAccounts.json');
  }

  get primaryKey(): StreamKey {
    return '_account_id';
  }

  async *readRecords(
    _syncMode: SyncMode,
    _cursorField?: string[]
  ): AsyncGenerator<AccountInfo> {
    const gerrit = await this.gerrit();

    let start = 0;
    const limit = this.config.page_size ?? 100;

    while (true) {
      const accounts = await gerrit.getAccounts({
        limit,
        start,
        query: 'is:active',
      });

      if (accounts.length === 0) break;

      for (const account of accounts) {
        if (account._account_id) {
          yield account;
        }
      }

      if (accounts.length < limit) break;
      start += limit;
    }
  }
}
