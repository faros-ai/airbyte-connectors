import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {toString} from 'lodash';
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
    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL
        ? toString(
            streamState?.[StreamBase.workspaceRepoKey(workspace, repo)]?.cutoff
          )
        : undefined;
    yield* bitbucket.getCommits(workspace, repo, lastUpdated);
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
