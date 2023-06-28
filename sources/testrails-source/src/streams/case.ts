import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Case} from '../models';
import {TestRails, TestRailsConfig} from '../testrails/testrails';

export interface CaseState {
  updated_after: number;
}

export class Cases extends AirbyteStreamBase {
  constructor(
    private readonly config: TestRailsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/case.json');
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
    streamState?: CaseState
  ): AsyncGenerator<Case> {
    const testRails = await TestRails.instance(this.config, this.logger);

    yield* testRails.getCases(
      syncMode === SyncMode.INCREMENTAL ? streamState.updated_after : undefined
    );
  }

  getUpdatedState(
    currentStreamState: CaseState,
    latestRecord: Case
  ): Dictionary<any> {
    return {
      updated_after: Math.max(
        currentStreamState.updated_after ?? 0,
        latestRecord.updated_on ?? 0
      ),
    };
  }
}
