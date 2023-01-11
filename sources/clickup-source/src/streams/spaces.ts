import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Space} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

interface StreamSlice {
  workspaceId: string;
}

export class Spaces extends AirbyteStreamBase {
  private clickup: ClickUp;

  constructor(
    private readonly cfg: ClickUpConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.clickup = ClickUp.make(cfg, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/spaces.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
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
