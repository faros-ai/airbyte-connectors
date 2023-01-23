import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Goal} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {StreamBase} from './common';

interface StreamSlice {
  workspaceId: string;
}

export class Goals extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/goals.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
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
  ): AsyncGenerator<Goal> {
    const workspaceId = streamSlice.workspaceId;
    for await (const goal of this.clickup.goals(workspaceId)) {
      yield {
        computedProperties: {workspace: {id: workspaceId}},
        ...goal,
      };
    }
  }
}
