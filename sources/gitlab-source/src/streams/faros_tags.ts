import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class FarosTags extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosTags.json');
  }

  get primaryKey(): StreamKey {
    return [['name'], ['project_path']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<Tag & {group_id: string; project_path: string}> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const projectPath = streamSlice?.project.path_with_namespace;
    
    if (!projectPath) {
      this.logger.warn('No project path found in stream slice');
      return;
    }

    for await (const tag of gitlab.getTags(projectPath)) {
      yield {
        ...tag,
        group_id: streamSlice.group_id,
        project_path: streamSlice.project.path,
      };
    }
  }
}