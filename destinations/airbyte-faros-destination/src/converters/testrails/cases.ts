import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TestRailsConverter} from './common';

export class Cases extends TestRailsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestCase',
    'qa_TestSuiteTestCaseAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const testCase = record.record.data;

    const uid = this.caseUid(
      testCase.project_id,
      testCase.suite_id,
      testCase.id
    );
    const milestoneTag = typeof testCase.milestone !== 'undefined'
      ? `milestone:${testCase.milestone}`
      : null;
    const automationTypeTag = typeof testCase.custom_automation_type !== 'undefined'
      ? `automation_type:${testCase.custom_automation_type}`
      : null;
    const updateAutomationTag = typeof testCase.custom_update_automation !== 'undefined'
      ? `update_automation:${testCase.custom_update_automation}`
      : null;
    const tags = [milestoneTag, automationTypeTag, updateAutomationTag].filter(tag => tag !== null);
    const formattedTags = tags.map(tag => `{${tag}}`).join('');

    res.push({
      model: 'qa_TestCase',
      record: {
        uid,
        name: testCase.title,
        source,
        tags: formattedTags,
        type: this.convertType(testCase.type),
      },
    });

    res.push({
      model: 'qa_TestSuiteTestCaseAssociation',
      record: {
        testSuite: {
          uid: this.suiteUid(testCase.project_id, testCase.suite_id),
          source,
        },
        testCase: {uid, source},
      },
    });

    return res;
  }
}
