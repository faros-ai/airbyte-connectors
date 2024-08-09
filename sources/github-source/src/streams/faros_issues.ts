import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Issue} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class FarosIssues extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssues.json');
  }

  get primaryKey(): StreamKey {
    return 'databaseId';
  }

  get cursorField(): string {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Issue> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const state = streamState?.[StreamBase.orgRepoKey(org, repo)];
    const cutoffDate = this.getUpdateStartDate(state?.cutoff);
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getIssues(org, repo, cutoffDate);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Issue,
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
