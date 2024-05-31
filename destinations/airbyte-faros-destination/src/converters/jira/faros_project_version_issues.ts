import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosProjectVersionIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskReleaseRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const issue = record.record.data;
    const source = this.streamName.source;
    return [
      {
        model: 'tms_TaskReleaseRelationship',
        record: {
          task: {uid: issue.key, source},
          release: {uid: issue.projectVersionId, source},
        },
      },
    ];
  }
}
