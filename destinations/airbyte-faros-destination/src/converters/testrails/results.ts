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
      ? DateTime.fromSeconds(result.created_on).toJSDate()
      : undefined;

    res.push({
      model: 'qa_TestCaseResult',
      record: {
        uid: this.resultUid(result.run_id, result.test_id, result.id),
        description: `Version: ${result.version}, Comment: ${result.comment} Duration: ${result.elapsed}`,
        startedAt,
        status: this.convertStatus(result.status),
        testCase: {
          uid: this.caseUid(result.project_id, result.suite_id, result.case_id),
          source,
        },
        testExecution: {
          uid: this.runUid(result.project_id, result.suite_id, result.run_id),
          source,
        },
      },
    });

    return res;
  }
}
