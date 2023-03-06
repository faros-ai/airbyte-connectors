import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Incident} from '../types';
import {StatuspageStreamBase} from './common';

interface StreamSlice {
  pageId: string;
}

type IncidentState = Dictionary<{lastUpdatedAt?: string}>;

export class Incidents extends StatuspageStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/incidents.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const page of await this.statuspage.getPages(this.cfg.page_ids)) {
      yield {pageId: page.id};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: IncidentState
  ): AsyncGenerator<Incident> {
    const pageId = streamSlice.pageId;
    const state =
      syncMode === SyncMode.INCREMENTAL ? streamState?.[pageId] : undefined;
    const lastUpdatedAt: Date = state?.lastUpdatedAt
      ? new Date(state?.lastUpdatedAt)
      : undefined;

    yield* this.statuspage.getIncidents(pageId, lastUpdatedAt);
  }

  getUpdatedState(
    currentStreamState: IncidentState,
    latestRecord: Incident
  ): IncidentState {
    const pageId = latestRecord.page_id;
    const currentPageState = currentStreamState[pageId] ?? {};
    const newPageState = {
      lastUpdatedAt:
        new Date(latestRecord.updated_at ?? 0) >
        new Date(currentPageState.lastUpdatedAt ?? 0)
          ? latestRecord.updated_at
          : currentPageState.lastUpdatedAt,
    };

    return {
      ...currentStreamState,
      [pageId]: newPageState,
    };
  }
}
