import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Run} from '../models';
import {TestRails, TestRailsConfig} from '../testrails/testrails';

export interface RunState {
  updated_after: number;
}

export class Runs extends AirbyteStreamBase {
  constructor(
    private readonly config: TestRailsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/run.json');
  }
  get primaryKey(): StreamKey {
    return ['project_id', 'suite_id', 'id'];
  }
  get cursorField(): string | string[] {
    return 'updated_on';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: RunState
  ): AsyncGenerator<Run> {
    const testRails = await TestRails.instance(this.config, this.logger);

    yield* testRails.getRuns(
      syncMode === SyncMode.INCREMENTAL ? streamState.updated_after : undefined
    );
  }

  getUpdatedState(currentStreamState: RunState, latestRecord: Run): RunState {
    return {
      updated_after: Math.max(
        currentStreamState.updated_after ?? 0,
        latestRecord.updated_on ?? 0
      ),
    };
  }
}
