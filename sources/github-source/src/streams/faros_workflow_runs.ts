import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {WorkflowRun} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {
  RepoStreamSlice,
  StreamBase,
  StreamState,
  StreamWithRepoSlices,
} from './common';

export class FarosWorkflowRuns extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosWorkflowRuns.json');
  }

  get primaryKey(): StreamKey {
    return [['org'], ['repo'], ['id']];
  }

  get cursorField(): string | string[] {
    return ['updated_at'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<WorkflowRun> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const state = streamState?.[StreamBase.orgRepoKey(org, repo)];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getWorkflowRuns(org, repo, startDate, endDate);
  }

  /**
   * The API used by this stream always return records sorted by created_at in descending order.
   *
   * Since filtering is only supported by a date range on the created_at field,
   * the workaround for syncing this stream incrementally is to use the updated_at as the cutoff
   * but querying also for records in the past 35 days as that's the maximum period for runs to complete.
   *
   * Reference: https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration#usage-limits
   */
  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: WorkflowRun,
    slice: RepoStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated_at ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgRepoKey(slice.org, slice.repo)
    );
  }
}
