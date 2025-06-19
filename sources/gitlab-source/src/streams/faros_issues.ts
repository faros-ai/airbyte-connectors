import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosIssueOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosIssues extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosIssues.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
    streamState?: StreamState,
  ): AsyncGenerator<FarosIssueOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const groupKey = StreamBase.groupProjectKey(
      streamSlice.group_id,
      streamSlice.path_with_namespace,
    );
    const [since, until] = this.getUpdateRange(streamState?.[groupKey]?.cutoff);

    for await (const issue of gitlab.getIssues(
      streamSlice.path_with_namespace,
      since,
      until,
    )) {
      yield {
        ...issue,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosIssueOutput,
  ): StreamState {
    const groupKey = StreamBase.groupProjectKey(
      latestRecord.group_id,
      latestRecord.project_path,
    );
    return this.getUpdatedStreamState(
      Utils.toDate(latestRecord.updated_at),
      currentStreamState,
      groupKey,
    );
  }
}
