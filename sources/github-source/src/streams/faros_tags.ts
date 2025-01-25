import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosTags extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTags.json');
  }

  get primaryKey(): StreamKey {
    return [['name'], ['commit_sha']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Tag> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getTags(org, repo);
  }
}
