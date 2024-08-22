import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraCommon, JiraConverter} from './common';

const typeCategories: ReadonlyMap<string, string> = new Map(
  ['Kanban', 'Scrum'].map((t) => [JiraCommon.normalize(t), t])
);

export class FarosBoards extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const board = record.record.data;
    const uid = board.uid;
    const source = this.streamName.source;
    return [
      {
        model: 'tms_TaskBoard',
        record: {
          uid,
          name: board.name,
          type: {
            category:
              typeCategories.get(JiraCommon.normalize(board.type)) ?? 'Custom',
            detail: board.type,
          },
          source,
        },
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
