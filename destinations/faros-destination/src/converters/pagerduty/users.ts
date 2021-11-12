import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PagerdutyConverter} from './common';

export class PagerdutyUsers extends PagerdutyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.id,
          email: user.email,
          name: user.name,
          source,
        },
      },
    ];
  }
}
