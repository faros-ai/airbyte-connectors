import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class JiraBoards extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    if (!this.useBoardOwnership(ctx)) return [];
    const board = record.record.data;
    const uid = board.id.toString();
    const source = this.streamName.source;
    return [
      {
        model: 'tms_TaskBoard',
        record: {uid, name: board.name, source},
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: {uid, source},
          project: {uid: board.projectKey, source},
        },
      },
    ];
  }
}
