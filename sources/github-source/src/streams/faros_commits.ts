import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

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
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Commit> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const defaultBranch = this.orgRepoFilter.getRepository(
      org,
      repo
    ).default_branch;
    const state = streamState?.[StreamBase.orgRepoKey(org, repo)];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getCommits(org, repo, defaultBranch, startDate, endDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Commit,
    slice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.committer?.date ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgRepoKey(slice.org, slice.repo)
    );
  }
}
