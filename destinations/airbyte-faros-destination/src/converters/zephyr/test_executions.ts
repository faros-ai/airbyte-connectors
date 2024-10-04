import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toString} from 'lodash';
import {custom} from 'zod';

import {DestinationRecord, StreamContext} from '../converter';
import {ZephyrConverter} from './common';

export class TestExecutions extends ZephyrConverter {
  readonly destinationModels = ['qa_TestExecution'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const testExecution = record.record.data;

    const testCaseResultsStats = {
      custom: testExecution.totalDefectCount,
    };

    return [
      {
        model: 'qa_TestExecution',
        record: {
          uid: toString(testExecution.id),
          source: this.source,
          name: testExecution.summary,
          description: Utils.cleanAndTruncate(testExecution.issueDescription),
          startedAt: Utils.toDate(testExecution.executedOnVal),
          status: TestExecutions.getStatus(testExecution.executionStatusName),
          suite: {uid: toString(testExecution.cycleId), source: this.source},
          task: {uid: toString(testExecution.issueKey), source: this.source},
        },
      },
    ];
  }

  private static getStatus(status: string): {category: string; detail: string} {
    const detail = status.toUpperCase();
    switch (detail) {
      case 'PASS':
        return {category: 'Success', detail};
      case 'FAIL':
        return {category: 'Failure', detail};
      case 'NA':
        return {category: 'Unknown', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
