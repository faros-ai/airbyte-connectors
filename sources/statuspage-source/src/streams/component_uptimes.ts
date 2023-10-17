import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {ComponentUptime} from '../types';
import {StatuspageStreamBase} from './common';

interface StreamSlice {
  pageId: string;
  componentId: string;
  startDate: string;
  componentGroupId?: string;
}

type ComponentUptimeState = Dictionary<Dictionary<{rangeEnd?: string}>>;

export class ComponentUptimes extends StatuspageStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/component_uptime.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'page_id', 'range_start', 'range_end'];
  }

  get cursorField(): string | string[] {
    return 'range_start';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    if (!this.cfg.fetch_component_uptime) {
      this.logger.debug(
        'Fetching component uptime is disabled. Skipping fetching component uptimes.'
      );
      return;
    }
    for (const page of await this.statuspage.getPages(this.cfg.page_ids)) {
      for await (const component of this.statuspage.getComponents(page.id)) {
        if (!component.showcase) {
          continue;
        }
        yield {
          pageId: page.id,
          componentId: component.id,
          startDate: component.start_date,
          componentGroupId: component.group_id,
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: ComponentUptimeState
  ): AsyncGenerator<ComponentUptime> {
    const pageId = streamSlice.pageId;
    const componentId = streamSlice.componentId;
    const rangeEnd =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[pageId]?.[componentId]?.rangeEnd
        : undefined;
    const rangeEndDate = rangeEnd ? new Date(rangeEnd) : undefined;

    yield* this.statuspage.getComponentUptime(
      pageId,
      componentId,
      new Date(streamSlice.startDate),
      streamSlice.componentGroupId,
      rangeEndDate
    );
  }

  getUpdatedState(
    currentStreamState: ComponentUptimeState,
    latestRecord: ComponentUptime
  ): ComponentUptimeState {
    const pageId = latestRecord.page_id;
    const componentId = latestRecord.id;
    const currentPageState = currentStreamState[pageId] ?? {};
    const currentComponentState = currentPageState[componentId] ?? {};
    const newComponentState = {
      rangeEnd:
        new Date(latestRecord.range_end ?? 0) >
        new Date(currentComponentState.rangeEnd ?? 0)
          ? latestRecord.range_end
          : currentComponentState.rangeEnd,
    };

    return {
      ...currentStreamState,
      [pageId]: {
        ...currentPageState,
        [componentId]: newComponentState,
      },
    };
  }
}
