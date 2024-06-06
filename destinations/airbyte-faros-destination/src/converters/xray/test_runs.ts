import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TestRun} from 'faros-airbyte-common/xray';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ModelEnumType, XrayConverter} from './common';

export class TestRuns extends XrayConverter {
  id(record: AirbyteRecord): string {
    return record.record?.data?.id;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestCaseResult',
    'tms_TaskTestCaseResultAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const run = record.record.data as TestRun;
    const testCase = {uid: run.test.key, source: this.source};
    const testCaseResult = {uid: run.id, testCase};

    const results = [];
    results.push({
      model: 'qa_TestCaseResult',
      record: {
        ...testCaseResult,
        startedAt: run.startedOn,
        endedAt: run.finishedOn,
        status: TestRuns.getStatus(run.status.name), // TODO - Fix status
        testExecution: {uid: run.testExecution.key, source: this.source},
      },
    });

    for (const defect of run.defects) {
      results.push({
        model: 'tms_TaskTestCaseResultAssociation',
        record: {testCaseResult, defect: {uid: defect, source: this.source}},
      });
    }

    for (const step of run.steps) {
      results.push({
        model: 'qa_TestCaseStepResult',
        record: {
          uid: step.id,
          status: TestRuns.getStatus(step.status.name),
          testStep: {uid: step.id, testCase},
          testResult: testCaseResult,
        },
      });
    }

    return results;
  }

  private static getStatus(status: string): ModelEnumType {
    const detail = status.toUpperCase();
    switch (detail) {
      case 'PASSED':
        return {category: 'Success', detail};
      case 'FAILED':
        return {category: 'Failure', detail};
      case 'TODO':
        return {category: 'Pending', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
