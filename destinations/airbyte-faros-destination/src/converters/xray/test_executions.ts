import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TestExecution} from 'faros-airbyte-common/xray';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {XrayConverter} from './common';

export class TestExecutions extends XrayConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestExecution',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const execution = record.record.data as TestExecution;
    return [
      {
        model: 'qa_TestExecution',
        record: {
          uid: execution.key,
          source: this.source,
          name: execution.summary,
          description: Utils.cleanAndTruncate(execution.description),
          tags: execution.labels,
          environments: execution.testEnvironments,
          task: {uid: execution.key, source: this.taskSource},
        },
      },
    ];
  }
}
