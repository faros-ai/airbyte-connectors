import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {TestPlanTest,XrayConfig} from '../types';
import {Xray} from '../xray';

export class TestPlanTests extends AirbyteStreamBase {
  constructor(
    private readonly config: XrayConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  get dependencies(): readonly string[] {
    return ['testPlans'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testPlanTests.json');
  }

  get primaryKey(): StreamKey {
    return ['testPlanIssueId', 'testIssueId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<TestPlanTest> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    for (const plan of await xrayClient.getTestPlans()) {
      for await (const test of xrayClient.getTestPlanTests(plan.issueId)) {
        yield {
          planIssueId: plan.issueId,
          planKey: plan.key,
          testIssueId: test.issueId,
          testKey: test.key,
        };
      }
    }
  }
}
