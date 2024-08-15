import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toString} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {Issue} from '../types';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class Issues extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/issues.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'updatedOn';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    const workspace = streamSlice.workspace;
    const repo = streamSlice.repo;
    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL
        ? toString(
            streamState?.[StreamBase.workspaceRepoKey(workspace, repo)]?.cutoff
          )
        : undefined;
    yield* bitbucket.getIssues(workspace, repo, lastUpdated);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue,
    streamSlice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updatedOn ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.workspaceRepoKey(streamSlice.workspace, streamSlice.repo)
    );
  }
}
