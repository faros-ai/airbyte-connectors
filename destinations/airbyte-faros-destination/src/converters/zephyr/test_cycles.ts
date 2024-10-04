import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {ZephyrConverter} from './common';

export class TestCycles extends ZephyrConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestSuite',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const testCycle = record.record.data;

    return [
      {
        model: 'qa_TestSuite',
        record: {
          uid: toString(testCycle.id),
          source: this.source,
          name: testCycle.name,
          description: Utils.cleanAndTruncate(testCycle.description),
        },
      },
    ];
  }
}
