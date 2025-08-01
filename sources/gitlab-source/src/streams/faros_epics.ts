import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosEpicOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {
  GroupStreamSlice,
  StreamBase,
  StreamState,
  StreamWithGroupSlices,
} from './common';

export class FarosEpics extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosEpics.json');
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
    streamSlice?: GroupStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<FarosEpicOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const groupKey = StreamBase.groupKey(streamSlice.group_id);
    const [since, until] = this.getUpdateRange(streamState?.[groupKey]?.cutoff);

    for await (const epic of gitlab.getEpics(
      streamSlice.group_id,
      since,
      until
    )) {
      yield {
        ...epic,
        group_id: streamSlice.group_id,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosEpicOutput
  ): StreamState {
    const groupKey = StreamBase.groupKey(latestRecord.group_id);
    return this.getUpdatedStreamState(
      Utils.toDate(latestRecord.updated_at),
      currentStreamState,
      groupKey
    );
  }
}
