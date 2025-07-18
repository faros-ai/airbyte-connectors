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
    ctx.logger.info(JSON.stringify(record));
    return [];
  }
}
