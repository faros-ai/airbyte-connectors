import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/bitbucket';
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

type StreamSlice = {
  workspace: string;
  repository: {slug: string; fullName: string};
};
type PullRequestState = Dictionary<{cutoff?: string}>;

export class PullRequests extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pull_requests.json');
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
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<PullRequest> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repo = streamSlice.repo;
    const lastUpdated =
      syncMode === SyncMode.INCREMENTAL
        ? toString(
            streamState?.[StreamBase.workspaceRepoKey(workspace, repo)]?.cutoff
          )
        : undefined;
    for (const pr of await bitbucket.getPullRequests(
      workspace,
      repo,
      lastUpdated
    )) {
      yield pr;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: PullRequest,
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
