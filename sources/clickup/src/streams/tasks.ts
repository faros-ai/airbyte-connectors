import fetch from 'cross-fetch';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {Dictionary} from 'ts-essentials';

export type Task = {
  id: string;
  name: string;
  description: string;
  date_created: number;
  date_updated: number;
  custom_fields: object[];
};

export type TaskState = {
  date_updated: number;
};

export class Tasks extends AirbyteStreamBase {
  constructor(
    private readonly config: AirbyteConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tasks.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string {
    return 'date_updated';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: TaskState
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const state = syncMode === SyncMode.INCREMENTAL ? streamState : undefined;
    const cursField = state?.date_updated;
    const res = this.getTasks(Number(cursField ? cursField : 0));
    yield* res;
  }

  getUpdatedState(
    currentStreamState: TaskState,
    latestRecord: Task
  ): TaskState {
    const date_updated = currentStreamState?.date_updated
      ? currentStreamState.date_updated
      : 0;
    const recordModified = latestRecord?.date_updated
      ? latestRecord.date_updated
      : 0;
    return {
      date_updated: _.max([date_updated, recordModified]),
    };
  }

  async *getTasks(updatetGreatThan: number): AsyncGenerator<Task> {
    let page = 0;
    let condition = true;
    while (condition) {
      const spaceNumber = this.config.space_number;
      let url = `https://api.clickup.com/api/v2/list/${spaceNumber}/task?page=${page}`;
      url +=
        updatetGreatThan === 0 ? '' : `&date_updated_gt=${updatetGreatThan}`;
      const res = await fetch(url, {
        method: 'get',
        headers: {
          Authorization: this.config.personal_token,
          'Content-Type': 'application/json',
        },
      });
      page++;
      const resp = await res.json();
      const responses = resp['tasks'] as Task[];
      const size = _.size(responses);
      if (size === 0) {
        condition = false;
        continue;
      }
      for (const task of responses) {
        yield {
          id: task.id,
          date_created: Number(task.date_created),
          date_updated: Number(task.date_updated),
          name: task.name,
          description: task.description,
          custom_fields: task.custom_fields,
        };
      }
    }
  }
}

// (async () => {
//   const conf: AirbyteConfig = require('../../secrets/config.json');
//   const res = new Tasks(conf, new AirbyteLogger());
//   const tasks = res.readRecords(SyncMode.FULL_REFRESH);
//   let task = await tasks.next();
//   let counter = 0;
//   while (!task.done) {
//     ++counter;
//     console.log(task.value);
//     task = await tasks.next();
//   }
//   console.log('counter OZZEN new : ' + counter);
// })();
