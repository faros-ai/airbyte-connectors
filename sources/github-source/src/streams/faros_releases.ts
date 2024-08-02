import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Release} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamState, StreamWithRepoSlices} from './common';

export class FarosReleases extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosReleases.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Release> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getReleases(org, repo);
  }
}
