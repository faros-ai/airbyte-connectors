import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {FarosJobOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class FarosJobs extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosJobs.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<FarosJobOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);

    for await (const job of gitlab.getJobs(streamSlice.path_with_namespace)) {
      yield {
        ...job,
        group_id: streamSlice.group_id,
        project_path: streamSlice.path,
      } as FarosJobOutput;
    }
  }
}
