import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class Tags extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tags.json');
  }
  get primaryKey(): StreamKey {
    return [['name'], ['target', 'hash']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Tag> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    const workspace = streamSlice.workspace;
    const repo = streamSlice.repo;
    yield* bitbucket.getTags(workspace, repo);
  }
}
