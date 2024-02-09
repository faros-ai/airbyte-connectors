import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class Boards extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.useBoardOwnership(ctx)) return [];

    const board = record.record.data;
    const uid = board.id.toString();
    const source = this.streamName.source;
    const organizationName = this.getOrganizationFromUrl(board.self);
    const organization = {uid: organizationName, source};
    return [
      {
        model: 'tms_TaskBoard',
        record: {uid, name: board.name, organization},
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
