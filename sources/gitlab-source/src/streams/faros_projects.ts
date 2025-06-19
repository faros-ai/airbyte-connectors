import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosProjectOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GroupStreamSlice, StreamWithGroupSlices} from './common';

export class FarosProjects extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice,
  ): AsyncGenerator<FarosProjectOutput> {
    for (const {repo, syncRepoData} of await this.groupFilter.getProjects(
      streamSlice?.group_id,
    )) {
      yield {
        ...repo,
        syncRepoData,
      };
    }
  }
}
