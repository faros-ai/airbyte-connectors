import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosGroupOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GroupStreamSlice, StreamWithGroupSlices} from './common';

export class FarosGroups extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosGroups.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice,
  ): AsyncGenerator<FarosGroupOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    yield gitlab.getGroup(streamSlice?.group_id);
  }
}
