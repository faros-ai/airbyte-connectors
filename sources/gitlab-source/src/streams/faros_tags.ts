import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosTagOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class FarosTags extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTags.json');
  }

  get primaryKey(): StreamKey {
    return ['project_path', 'name'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
  ): AsyncGenerator<FarosTagOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);

    for await (const tag of gitlab.getTags(streamSlice.path_with_namespace)) {
      yield {
        ...tag,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path,
      };
    }
  }
}
