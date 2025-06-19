import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GitLabTag} from '../gitlab';

type Tag = GitLabTag;

import {GitLab} from '../gitlab';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class FarosTags extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTags.json');
  }

  get primaryKey(): StreamKey {
    return ['name', 'commit_id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice,
  ): AsyncGenerator<Tag & {group_id: string; project_path: string}> {
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
