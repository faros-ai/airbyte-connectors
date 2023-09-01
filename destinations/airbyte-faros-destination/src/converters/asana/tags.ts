import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaConverter} from './common';

export class Tags extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const tag = record.record.data;
    return [
      {
        model: 'tms_Label',
        record: {
          name: tag.name,
        },
      },
    ];
  }
}
