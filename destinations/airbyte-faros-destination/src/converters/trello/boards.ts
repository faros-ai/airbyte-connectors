import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {TrelloConverter} from './common';
import {Board} from './models';

export class Boards extends TrelloConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_Project',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const board = record.record.data as Board;

    const tmsBoard: DestinationRecord = {
      model: 'tms_TaskBoard',
      record: {
        uid: board.id,
        name: board.name,
        source,
      },
    };

    const tmsProject: DestinationRecord = {
      model: 'tms_Project',
      record: tmsBoard.record,
    };

    const boardProjectRelationship: DestinationRecord = {
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: {uid: board.id, source},
        project: {uid: board.id, source},
      },
    };

    return [tmsBoard, tmsProject, boardProjectRelationship];
  }
}
