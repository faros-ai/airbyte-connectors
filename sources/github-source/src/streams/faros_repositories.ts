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
    const org = streamSlice?.org;
    const github = await GitHub.instance(this.config, this.logger);
    for (const {repo, syncRepoData} of await this.orgRepoFilter.getRepositories(
      org
    )) {
      let languages: {language: string; bytes: number}[] | undefined;
      if (syncRepoData) {
        languages = await github.getRepositoryLanguages(org, repo.name);
      }
      yield {
        ...repo,
        ...(languages && {languages}),
        tmsEnabled: this.config.tmsEnabled,
        syncRepoData,
      };
    }
  }
}
