import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {ContributorStats} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamState, StreamWithRepoSlices} from './common';

export class FarosContributorsStats extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosContributorsStats.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'repo', 'user'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<ContributorStats> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getContributorsStats(org, repo);
  }
}
