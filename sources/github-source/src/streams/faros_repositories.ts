import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {OrgStreamSlice, StreamWithOrgSlices} from './common';

export class FarosRepositories extends StreamWithOrgSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosRepositories.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'name'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: OrgStreamSlice
  ): AsyncGenerator<Repository & {syncNestedData: boolean}> {
    const org = streamSlice?.org;
    for (const {
      repo,
      syncNestedData,
    } of await this.orgRepoFilter.getRepositories(org)) {
      yield {
        ...repo,
        syncNestedData,
      };
    }
  }
}
