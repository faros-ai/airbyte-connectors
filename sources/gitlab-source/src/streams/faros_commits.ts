import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosCommits extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosCommits.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'committed_date';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Commit> {
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
      `Fetching commits for project ${project.path_with_namespace} on branch ${project.default_branch} from ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    const commits = await gitlab.getCommits(
      project.path_with_namespace,
      project.default_branch,
      startDate,
      endDate
    );

    for (const commit of commits) {
      yield {
        ...commit,
        group_id: groupId,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Commit,
    slice: ProjectStreamSlice
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.committed_date ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.groupProjectKey(slice.group_id, slice.project.path_with_namespace)
    );
  }
}