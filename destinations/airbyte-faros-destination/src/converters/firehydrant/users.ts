import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {FireHydrantConverter} from './common';
import {User} from './models';

export class Users extends FireHydrantConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_User',
    'tms_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

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
      {
        model: 'tms_User',
        record: {
          uid: user.id,
          emailAddress: user.email,
          name: user.name,
          source,
        },
      },
    ];
  }
}
