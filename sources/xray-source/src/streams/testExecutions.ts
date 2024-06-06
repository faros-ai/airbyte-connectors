import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {TestExecution} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {XrayConfig} from '../types';
import {Xray} from '../xray';

export class TestExecutions extends AirbyteStreamBase {
  constructor(
    private readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testExecutions.json');
  }

  get primaryKey(): StreamKey {
    return ['issueId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<TestExecution> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    yield* xrayClient.getTestExecutions();
  }
}
