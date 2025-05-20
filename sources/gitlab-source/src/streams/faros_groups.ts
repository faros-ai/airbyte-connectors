import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {Group} from '../types';
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
    streamSlice?: GroupStreamSlice
  ): AsyncGenerator<Group> {
    const group = streamSlice?.group;
    const gitlab = await GitLab.instance(this.config, this.logger);
    yield gitlab.getGroup(group);
  }
}
