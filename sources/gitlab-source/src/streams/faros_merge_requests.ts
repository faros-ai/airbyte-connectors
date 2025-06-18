import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {GitLabMergeRequest} from '../gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

type MergeRequest = GitLabMergeRequest;

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
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updatedAt';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<MergeRequest> {
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
      `Fetching merge requests for project ${project.path_with_namespace} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    for await (const mergeRequest of gitlab.getMergeRequestsWithNotes(
      project.path_with_namespace,
      startDate,
      endDate
    )) {
      yield {
        ...mergeRequest,
        group_id: groupId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: MergeRequest,
    slice: ProjectStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated_at ?? 0);
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
