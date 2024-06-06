import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {TestRun} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {XrayConfig} from '../types';
import {Xray} from '../xray';

export class TestRuns extends AirbyteStreamBase {
  constructor(
    private readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testRuns.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<TestRun> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    yield* xrayClient.getTestRuns();
  }
}
