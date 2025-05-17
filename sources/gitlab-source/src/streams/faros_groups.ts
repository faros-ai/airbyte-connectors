import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GroupStreamSlice, StreamWithGroupSlices} from './common';

export class FarosGroups extends StreamWithGroupSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosGroups.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'path';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: GroupStreamSlice
  ): AsyncGenerator<any> {
    const groupPath = streamSlice?.group;
    const gitlab = await GitLab.instance(this.config, this.logger);
    const group = await gitlab.getGroup(groupPath);
    
    yield {
      path: group.path,
      name: group.name,
      description: group.description,
      web_url: group.web_url,
      created_at: group.created_at,
      updated_at: group.updated_at
    };
  }
}
