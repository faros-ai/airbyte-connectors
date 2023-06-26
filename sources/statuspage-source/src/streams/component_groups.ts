import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {ComponentGroup} from '../types';
import {StatuspageStreamBase} from './common';

interface StreamSlice {
  pageId: string;
}

export class ComponentGroups extends StatuspageStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/component_groups.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const page of await this.statuspage.getPages(this.cfg.page_ids)) {
      yield {pageId: page.id};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<ComponentGroup> {
    const pageId = streamSlice.pageId;
    yield* this.statuspage.getComponentGroups(pageId);
  }
}
