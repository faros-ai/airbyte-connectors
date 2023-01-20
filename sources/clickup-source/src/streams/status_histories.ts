import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {StatusHistory} from 'faros-airbyte-common/clickup';
import {chunk} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {ListStreamSlice, StreamWithListSlices} from './common';

type StreamState = {[listId: string]: {lastUpdatedDate: string}};

export class StatusHistories extends StreamWithListSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/status_histories.json');
  }

  get primaryKey(): StreamKey {
    return ['computedProperties', 'task', 'id'];
  }

  get cursorField(): string | string[] {
    return ['computedProperties', 'task', 'date_updated'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ListStreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<StatusHistories> {
    const listId = streamSlice.listId;
    const lastUpdatedDate =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[listId]?.lastUpdatedDate
        : undefined;
    const tasks = await this.clickup.tasks(
      listId,
      lastUpdatedDate,
      this.cfg.fetch_archived
    );
    if (tasks.length === 0) {
      return;
    }
    for (const taskChunk of chunk(tasks, 100)) {
      const statusHistories = await this.clickup.statusHistories(
        taskChunk.map((t) => t.id)
      );
      for (const [taskId, history] of Object.entries(statusHistories)) {
        const task = taskChunk.find((t) => t.id === taskId);
        yield {
          computedProperties: {
            task: {
              id: taskId,
              archived: task.archived,
              date_updated: task.date_updated,
              list: {id: listId},
              workspace: {id: streamSlice.workspaceId},
            },
          },
          ...history,
        };
      }
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: StatusHistory
  ): StreamState {
    // This stream fetches non-archived tasks first, then archived tasks. To
    // avoid missing a time window of task updates, we only use non-archived
    // tasks to update incremental state, at the cost of possibly re-fetching
    // some archived tasks during the next sync.
    if (latestRecord.computedProperties.task.archived) {
      return currentStreamState;
    }
    const listId = latestRecord.computedProperties.task.list.id;
    const lastUpdatedDate = currentStreamState[listId]?.lastUpdatedDate;
    const latestRecordUpdatedDate = Number(
      latestRecord.computedProperties.task.date_updated
    );
    if (new Date(latestRecordUpdatedDate) > new Date(lastUpdatedDate ?? 0)) {
      return {
        ...currentStreamState,
        [listId]: {lastUpdatedDate: `${latestRecordUpdatedDate}`},
      };
    }
    return currentStreamState;
  }
}
