import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {RepositoryLanguage} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosRepositoryLanguages extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosRepositoryLanguages.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'repo', 'language'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<RepositoryLanguage> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    for await (const repoLanguage of github.getRepoLanguages(org, repo)) {
      yield repoLanguage;
    }
  }
}
