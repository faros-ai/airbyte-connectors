import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PullRequestComment} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class FarosPullRequestComments extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosPullRequestComments.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<PullRequestComment> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const state = streamState?.[StreamBase.orgRepoKey(org, repo)];
    const cutoffDate = this.getUpdateStartDate(state?.cutoff);
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getPullRequestComments(org, repo, cutoffDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: any, // TODO: Specify type
    slice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updatedAt ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgRepoKey(slice.org, slice.repo)
    );
  }
}
