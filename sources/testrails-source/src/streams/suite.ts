import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Suite} from '../models';
import {TestRails, TestRailsConfig} from '../testrails/testrails';

export class Suites extends AirbyteStreamBase {
  constructor(
    private readonly config: TestRailsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/suite.json');
  }
  get primaryKey(): StreamKey {
    return ['project_id', 'id'];
  }
  get cursorField(): string | string[] {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Suite> {
    const testRails = await TestRails.instance(this.config, this.logger);

    yield* testRails.getSuites();
  }
}
