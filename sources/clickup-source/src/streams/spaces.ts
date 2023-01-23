import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Space} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {StreamBase} from './common';

interface StreamSlice {
  workspaceId: string;
}

export class Spaces extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/spaces.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const workspace of await this.clickup.workspaces(
      this.cfg.workspaces
    )) {
      yield {
        workspaceId: workspace.id,
      };
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Space> {
    const workspaceId = streamSlice.workspaceId;
    for (const space of await this.clickup.spaces(
      workspaceId,
      this.cfg.fetch_archived
    )) {
      yield {
        computedProperties: {workspace: {id: workspaceId}},
        ...space,
      };
    }
  }
}
