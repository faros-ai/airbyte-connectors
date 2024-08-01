import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamState, StreamWithRepoSlices} from './common';

export class FarosTags extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTags.json');
  }

  get primaryKey(): StreamKey {
    return [['name'], ['commit', 'sha']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Tag> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getTags(org, repo);
  }
}
