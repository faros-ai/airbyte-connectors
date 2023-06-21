import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TestRailsConverter} from './common';

export class Results extends TestRailsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestCaseResult',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const result = record.record.data;

    const startedAt = result.created_on
      ? DateTime.fromSeconds(result.created_on)
      : undefined;

    res.push({
      model: 'qa_TestCaseResult',
      record: {
        uid: result.id,
        description: `Version: ${result.version}, Comment: ${result.comment} Duration: ${result.elapsed}`,
        startedAt,
        status: this.convertStatus(result.status),
        testCase: {uid: result.case_id, source},
        testExecution: {uid: result.run_id, source},
      },
    });

    return res;
  }
}
