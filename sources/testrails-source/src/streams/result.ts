import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Result} from '../models';
import {TestRails, TestRailsConfig} from '../testrails/testrails';

export class Results extends AirbyteStreamBase {
  constructor(
    private readonly config: TestRailsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  /**
   * Results stream depends on Runs stream to ensure runs are fetched first.
   * Since listRuns is memoized by projectId, Results will reuse the cached
   * runs data fetched by the Runs stream, avoiding duplicate API calls.
   */
  get dependencies(): ReadonlyArray<string> {
    return ['runs'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/result.json');
  }
  get primaryKey(): StreamKey {
    return ['run_id', 'test_id', 'id'];
  }
  get cursorField(): string | string[] {
    return 'created_on';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>
  ): AsyncGenerator<Result> {
    const testRails = await TestRails.instance(this.config, this.logger);

    // Reuses memoized runs from Runs stream (called with just projectId)
    yield* testRails.getResults();
  }
}
