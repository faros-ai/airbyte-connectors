import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosPullRequests extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosPullRequests.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'repo', 'number'];
  }

  get cursorField(): string | string[] {
    return ['updatedAt'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<PullRequest> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    const pullRequests = await github.getPullRequests(org, repo);
    for (const pr of pullRequests) {
      yield pr;
    }
  }
}
