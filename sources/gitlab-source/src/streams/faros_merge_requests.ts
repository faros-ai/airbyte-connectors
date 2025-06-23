import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosMergeRequestOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosMergeRequests extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosMergeRequests.json');
  }

  get primaryKey(): StreamKey {
    return ['group_id', 'project_path', 'iid'];
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState,
  ): AsyncGenerator<FarosMergeRequestOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const stateKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      streamSlice.path_with_namespace,
    );
    const state = streamState?.[stateKey];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    for await (const mergeRequest of gitlab.getMergeRequestsWithNotes(
      streamSlice.path_with_namespace,
      startDate,
      endDate,
    )) {
      yield {
        ...mergeRequest,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path_with_namespace,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosMergeRequestOutput,
    slice: ProjectStreamSlice,
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updatedAt ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.groupProjectKey(slice.group_id, slice.path_with_namespace),
    );
  }
}
