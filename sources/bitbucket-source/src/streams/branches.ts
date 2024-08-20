import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Branch} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class Branches extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/branches.json');
  }

  get primaryKey(): StreamKey {
    return 'name';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Branch> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repoSlug = streamSlice.repo;
    yield* bitbucket.getBranches(workspace, repoSlug);
  }
}
