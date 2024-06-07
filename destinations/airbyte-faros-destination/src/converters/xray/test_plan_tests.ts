import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TestPlanTest} from 'faros-airbyte-common/xray';

import {DestinationModel, DestinationRecord} from '../converter';
import {XrayConverter} from './common';

export class TestPlanTests extends XrayConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestSuiteTestCaseAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const test = record.record.data as TestPlanTest;
    return [
      {
        model: 'qa_TestSuiteTestCaseAssociation',
        record: {
          testSuite: {uid: test.planKey, source: this.source},
          testCase: {uid: test.testKey, source: this.source},
        },
      },
    ];
  }
}
