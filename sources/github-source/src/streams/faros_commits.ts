import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosCommits extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCommits.json');
  }

  get primaryKey(): StreamKey {
    return 'oid';
  }

  get cursorField(): string | string[] {
    return ['committer', 'date'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Commit> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const defaultBranch = streamSlice?.defaultBranch;
    const github = await GitHub.instance(this.config, this.logger);
    const commits = github.getCommits(org, repo, defaultBranch);
    for await (const commit of commits) {
      yield commit;
    }
  }
}
