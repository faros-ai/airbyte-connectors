import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Board} from './models';

export class Boards extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const Board = record.record.data as Board;
    return [
      {
        model: 'tms_TaskBoard',
        record: {
          uid: String(Board.id),
          name: Board.name,
        },
      },
    ];
  }
}
