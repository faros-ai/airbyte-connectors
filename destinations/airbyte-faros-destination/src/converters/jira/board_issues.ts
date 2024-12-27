import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class BoardIssues extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoardRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.useBoardOwnership(ctx)) return [];
    const issue = record.record.data;
    const source = this.initializeSource(ctx);
    const relation = {
      task: {uid: issue.key, source},
      board: {uid: String(issue.boardId), source},
    };
    return [
      issue.isDeleted
        ? {
            model: 'tms_TaskBoardRelationship__Deletion',
            record: {
              where: relation,
            },
          }
        : {
            model: 'tms_TaskBoardRelationship',
            record: relation,
          },
    ];
  }
}
