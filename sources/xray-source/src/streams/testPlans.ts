import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {TestPlan} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {XrayConfig} from '../types';
import {Xray} from '../xray';

export class TestPlans extends AirbyteStreamBase {
  constructor(
    private readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testPlans.json');
  }

  get primaryKey(): StreamKey {
    return ['issueId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<TestPlan> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    for (const plan of await xrayClient.getTestPlans()) {
      yield plan;
    }
  }
}
