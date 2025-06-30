import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosReleaseOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamWithProjectSlices,
} from './common';

export class FarosReleases extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosReleases.json');
  }

  get primaryKey(): StreamKey {
    return ['project_path', 'tag_name'];
  }

  get cursorField(): string | string[] {
    return 'created_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<FarosReleaseOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const stateKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      streamSlice.path_with_namespace
    );
    const state = streamState?.[stateKey];
    const [startDate, endDate] =
      syncMode === SyncMode.INCREMENTAL
        ? this.getUpdateRange(state?.cutoff)
        : this.getUpdateRange();

    for await (const release of gitlab.getReleases(
      streamSlice.path_with_namespace,
      startDate,
      endDate
    )) {
      yield {
        ...release,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path,
      };
    }
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: FarosReleaseOutput,
    streamSlice: ProjectStreamSlice
  ): Dictionary<any> {
    const stateKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      streamSlice.path_with_namespace
    );
    const latestRecordCutoff = Utils.toDate(latestRecord?.created_at ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      stateKey
    );
  }
}
