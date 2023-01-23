import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Task} from 'faros-airbyte-common/clickup';
import {Dictionary} from 'ts-essentials';

import {ListStreamSlice, StreamWithListSlices} from './common';

type StreamState = {[listId: string]: {lastUpdatedDate: string}};

export class Tasks extends StreamWithListSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tasks.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'date_updated';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ListStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Task> {
    const listId = streamSlice.listId;
    const lastUpdatedDate =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[listId]?.lastUpdatedDate
        : undefined;
    for (const task of await this.clickup.tasks(
      listId,
      lastUpdatedDate,
      this.cfg.fetch_archived
    )) {
      yield {
        computedProperties: {workspace: {id: streamSlice.workspaceId}},
        ...task,
      };
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Task
  ): StreamState {
    // This stream fetches non-archived tasks first, then archived tasks. To
    // avoid missing a time window of task updates, we only use non-archived
    // tasks to update incremental state, at the cost of possibly re-fetching
    // some archived tasks during the next sync.
    if (latestRecord.archived) {
      return currentStreamState;
    }
    const listId = latestRecord.list.id;
    const lastUpdatedDate = currentStreamState[listId]?.lastUpdatedDate;
    const latestRecordUpdatedDate = Number(latestRecord.date_updated);
    if (new Date(latestRecordUpdatedDate) > new Date(lastUpdatedDate ?? 0)) {
      return {
        ...currentStreamState,
        [listId]: {lastUpdatedDate: `${latestRecordUpdatedDate}`},
      };
    }
    return currentStreamState;
  }
}
