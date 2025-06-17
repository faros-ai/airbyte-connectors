import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
type MergeRequestEvent = any;
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosMergeRequestReviews extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosMergeRequestReviews.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'created_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<MergeRequestEvent> {
    const groupId = streamSlice?.group_id;
    const project = streamSlice?.project;

    if (!groupId || !project) {
      return;
    }

    const gitlab = await GitLab.instance(this.config, this.logger);
    const stateKey = StreamBase.groupProjectKey(
      groupId,
      project.path_with_namespace
    );
    const state = streamState?.[stateKey];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    this.logger.info(
      `Fetching merge request reviews for project ${project.path_with_namespace} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    for await (const review of gitlab.getMergeRequestEvents(
      project.path_with_namespace,
      startDate,
      endDate
    )) {
      yield {
        ...review,
        group_id: groupId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: MergeRequestEvent,
    slice: ProjectStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.created_at ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.groupProjectKey(
        slice.group_id,
        slice.project.path_with_namespace
      )
    );
  }
}
