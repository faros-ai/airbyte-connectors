import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Goal} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

interface StreamSlice {
  workspaceId: string;
}

export class Goals extends AirbyteStreamBase {
  private clickup: ClickUp;

  constructor(cfg: ClickUpConfig, protected readonly logger: AirbyteLogger) {
    super(logger);
    this.clickup = ClickUp.make(cfg, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/goals.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const workspace of await this.clickup.workspaces()) {
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
