import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TestPlan} from 'faros-airbyte-common/xray';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {XrayConverter} from './common';

export class TestPlans extends XrayConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestSuite',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const plan = record.record.data as TestPlan;
    return [
      {
        model: 'qa_TestSuite',
        record: {
          uid: plan.key,
          source: this.source,
          name: plan.summary,
          description: plan.description,
          tags: plan.labels,
          task: {uid: plan.key, source: this.taskSource},
        },
      },
    ];
  }
}
