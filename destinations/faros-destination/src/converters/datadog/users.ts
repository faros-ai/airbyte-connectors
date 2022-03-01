import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {DataDogConverter} from './common';

export class DataDogUsers extends DataDogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord,
    _ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user?.id,
          email: user?.attributes?.email,
          name: user?.attributes?.name,
          source,
        },
      },
    ];
  }
}
