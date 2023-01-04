import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {List} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

interface StreamSlice {
  workspaceId: string;
  parent: {type: 'space'; id: string} | {type: 'folder'; id: string};
}

export class Lists extends AirbyteStreamBase {
  private clickup: ClickUp;

  constructor(
    private readonly cfg: ClickUpConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.clickup = ClickUp.instance(cfg, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/lists.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const workspace of await this.clickup.workspaces()) {
      const baseSlice = {workspaceId: workspace.id};
      for (const space of await this.clickup.spaces(
        workspace.id,
        this.cfg.fetch_archived
      )) {
        yield {...baseSlice, parent: {type: 'space', id: space.id}};
        for (const folder of await this.clickup.folders(
          space.id,
          this.cfg.fetch_archived
        )) {
          yield {...baseSlice, parent: {type: 'folder', id: folder.id}};
        }
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<List> {
    const lists =
      streamSlice.parent.type === 'folder'
        ? await this.clickup.listsInFolder(
            streamSlice.parent.id,
            this.cfg.fetch_archived
          )
        : await this.clickup.listsInSpace(
            streamSlice.parent.id,
            this.cfg.fetch_archived
          );
    for (const list of lists) {
      yield {
        computedProperties: {workspace: {id: streamSlice.workspaceId}},
        ...list,
      };
    }
  }
}
