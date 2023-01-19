import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Folder} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

interface StreamSlice {
  workspaceId: string;
  spaceId: string;
}

export class Folders extends AirbyteStreamBase {
  private clickup: ClickUp;

  constructor(
    private readonly cfg: ClickUpConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.clickup = ClickUp.instance(cfg, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/folders.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const workspace of await this.clickup.workspaces()) {
      for (const space of await this.clickup.spaces(
        workspace.id,
        this.cfg.fetch_archived
      )) {
        yield {workspaceId: workspace.id, spaceId: space.id};
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Folder> {
    for (const folder of await this.clickup.folders(
      streamSlice.spaceId,
      this.cfg.fetch_archived
    )) {
      yield {
        computedProperties: {workspace: {id: streamSlice.workspaceId}},
        ...folder,
      };
    }
  }
}
