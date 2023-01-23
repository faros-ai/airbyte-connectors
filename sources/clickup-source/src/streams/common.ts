import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';

import {ClickUpConfig} from '..';
import {ClickUp} from '../clickup';

export abstract class StreamBase extends AirbyteStreamBase {
  protected clickup: ClickUp;

  constructor(
    protected readonly cfg: ClickUpConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.clickup = ClickUp.instance(cfg, logger);
  }
}

export interface ListStreamSlice {
  workspaceId: string;
  listId: string;
}

// Base stream class that generates stream slices for all ClickUp task Lists
export abstract class StreamWithListSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<ListStreamSlice> {
    for (const workspace of await this.clickup.workspaces(
      this.cfg.workspaces
    )) {
      const baseSlice = {workspaceId: workspace.id};
      for (const space of await this.clickup.spaces(
        workspace.id,
        this.cfg.fetch_archived
      )) {
        for (const list of await this.clickup.listsInSpace(
          space.id,
          this.cfg.fetch_archived
        )) {
          yield {...baseSlice, listId: list.id};
        }
        for (const folder of await this.clickup.folders(
          space.id,
          this.cfg.fetch_archived
        )) {
          for (const list of await this.clickup.listsInFolder(
            folder.id,
            this.cfg.fetch_archived
          )) {
            yield {...baseSlice, listId: list.id};
          }
        }
      }
    }
  }
}
