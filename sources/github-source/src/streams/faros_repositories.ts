import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
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
  ): AsyncGenerator<Repository> {
    const github = await GitHub.instance(this.config, this.logger);
    const org = streamSlice?.org;
    const repositories = await this.orgRepoFilter.getRepositories(org);
    for (const repository of repositories) {
      yield repository;
    }
  }
}
