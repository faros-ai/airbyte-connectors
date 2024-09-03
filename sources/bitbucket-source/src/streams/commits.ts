import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class Commits extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/commits.json');
  }
  get primaryKey(): StreamKey {
    return 'hash';
  }
  get cursorField(): string | string[] {
    return 'date';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Commit> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    const workspace = streamSlice.workspace;
    const repo = streamSlice.repo;
    const repository = this.workspaceRepoFilter.getRepository(workspace, repo);
    const state = streamState?.[StreamBase.workspaceRepoKey(workspace, repo)];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();
    yield* bitbucket.getCommits(
      workspace,
      repo,
      repository.mainBranch,
      startDate,
      endDate
    );
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Commit,
    streamSlice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.date ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.workspaceRepoKey(streamSlice.workspace, streamSlice.repo)
    );
  }
}
