import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GroupStreamSlice, StreamWithGroupSlices} from './common';
import {Project} from 'faros-airbyte-common/gitlab';

export class FarosProjects extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
  }

  get primaryKey(): StreamKey {
    return ['group_id', 'id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice
  ): AsyncGenerator<Project> {
    const group = streamSlice?.group;
    for (const {repo, syncRepoData} of await this.groupFilter.getProjects(
      group
    )) {
      yield {
        ...repo,
        syncRepoData,
      };
    }
  }
}
