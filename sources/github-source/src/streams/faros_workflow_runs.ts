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

type WorkflowRunsState = {
  readonly [orgRepoKey: string]: {
    cutoff: number;
    isPending?: boolean;
  };
};

const MAX_PENDING_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days

export class FarosWorkflowRuns extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosWorkflowRuns.json');
  }

  get primaryKey(): StreamKey {
    return [['org'], ['repo'], ['id']];
  }

  get cursorField(): string | string[] {
    return ['created_at'];
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
   * Since it supports filtering by a date range, the workaround for syncing this stream incrementally
   * is to use the created_at as the cutoff, but if a run is not completed, next sync we are forced
   * to sync from that pending run.
   *
   * There are some edge cases where runs are stuck and never complete,
   * and others where it may be waiting on approval or manual intervention (max 35 days per docs),
   * so we consider a maximum period of time for the run to complete.
   *
   * Reference: https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration#usage-limits
   */
  getUpdatedState(
    currentStreamState: WorkflowRunsState,
    latestRecord: WorkflowRun,
    slice: RepoStreamSlice
  ): WorkflowRunsState {
    const key = StreamBase.orgRepoKey(slice.org, slice.repo);
    if (
      currentStreamState?.[key]?.isPending &&
      !isStaleRun(currentStreamState[key].cutoff)
    ) {
      return currentStreamState;
    }
    const latestRecordCutoff = Utils.toDate(latestRecord?.created_at ?? 0);
    const state = this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.orgRepoKey(slice.org, slice.repo)
    );
    return {
      ...state,
      [key]: {
        ...state[key],
        ...(latestRecord.status !== 'completed' &&
          !isStaleRun(latestRecord.created_at) && {isPending: true}),
      },
    };
  }
}

function isStaleRun(cutoff?: number | string) {
  return (
    cutoff && Date.now() - Utils.toDate(cutoff).getTime() > MAX_PENDING_TIME
  );
}
