import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TestRailsConverter} from './common';

export class Suites extends TestRailsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestSuite',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const suite = record.record.data;

    const masterTag = `master:${suite.is_master}`;
    const baselineTag = `baseline:${suite.is_baseline}`;
    const completedTag = `completed:${suite.is_completed}`;

    res.push({
      model: 'qa_TestSuite',
      record: {
        uid: this.suiteUid(suite.project_id, suite.id),
        name: suite.name,
        description: suite.description,
        tags: [masterTag, baselineTag, completedTag],
        source,
      },
    });

    return res;
  }
}
