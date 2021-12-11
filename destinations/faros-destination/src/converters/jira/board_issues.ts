import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class JiraBoardIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoardRelationship',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    if (!this.useBoardOwnership(ctx)) return [];
    const issue = record.record.data;
    const source = this.streamName.source;
    return [
      {
        model: 'tms_TaskBoardRelationship',
        record: {
          task: {uid: issue.key, source},
          board: {uid: String(issue.boardId), source},
        },
      },
    ];
  }
}
