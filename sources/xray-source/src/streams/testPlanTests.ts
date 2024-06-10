import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {TestPlanTest} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {StreamSlice, XrayProjectStream} from './common';

export class TestPlanTests extends XrayProjectStream {
  get dependencies(): readonly string[] {
    return ['testPlans'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testPlanTests.json');
  }

  get primaryKey(): StreamKey {
    return ['planIssueId', 'testIssueId'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<TestPlanTest> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const project = streamSlice?.project;
    for (const plan of await xrayClient.getTestPlans(project)) {
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
