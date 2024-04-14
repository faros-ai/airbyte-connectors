import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Asana, AsanaConfig, MIN_DATE} from '../asana';
import {Task} from '../models';
import {StreamSlice} from './common';

type StreamState = {[workspace: string]: {modified_at: string}};

export class Tasks extends AirbyteStreamBase {
  constructor(
    private readonly config: AsanaConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tasks.json');
  }

  get primaryKey(): StreamKey {
    return 'gid';
  }

  get cursorField(): string | string[] {
    return 'modified_at';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const asana = Asana.instance(this.config, this.logger);

    for (const workspace of await asana.getWorkspaces()) {
      yield {workspace: workspace.gid};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Task> {
    const modified_at =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.workspace]?.modified_at
        : undefined;

    const asana = Asana.instance(this.config, this.logger);

    yield* asana.getTasks(streamSlice.workspace, modified_at, this.logger);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Task
  ): StreamState {
    const workspace = latestRecord.workspace.gid;
    const modified_at = currentStreamState[workspace]?.modified_at ?? MIN_DATE;
    const latestRecordModifiedAt = latestRecord?.modified_at ?? MIN_DATE;

    if (new Date(latestRecordModifiedAt) > new Date(modified_at)) {
      return {
        ...currentStreamState,
        [workspace]: {modified_at: latestRecordModifiedAt},
      };
    }
    return currentStreamState;
  }
}
