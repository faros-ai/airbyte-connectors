import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Edition} from '../../common/types';
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
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
