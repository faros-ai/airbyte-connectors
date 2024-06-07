import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Test, TestType} from 'faros-airbyte-common/xray';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {ModelEnumType, XrayConverter} from './common';

export class Tests extends XrayConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestCase',
    'qa_TestCaseStep',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const test = record.record.data as Test;
    const preconditions = test.preconditions.map((p) => {
      return {
        condition: p.definition,
        description: p.key,
      };
    });
    const results = [];
    results.push({
      model: 'qa_TestCase',
      record: {
        uid: test.key,
        name: test.summary,
        description: Utils.cleanAndTruncate(test.description),
        before: preconditions,
        type: Tests.getType(test.testType),
        tags: test.labels,
        task: {uid: test.key, source: this.taskSource},
        source: this.source,
      },
    });
    for (const step of test.steps ?? []) {
      results.push({
        model: 'qa_TestCaseStep',
        record: {
          uid: step.id,
          name: step.action,
          data: step.data,
          result: step.result,
          testCase: {uid: test.key, source: this.source},
        },
      });
    }
    return results;
  }

  private static getType(type: TestType): ModelEnumType {
    if (type.name.toLowerCase() === 'manual') {
      return {category: 'Manual', detail: type.kind};
    }
    return {category: 'Custom', detail: type.name};
  }
}
