import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {OpsGenieConverter} from './common';
import {User} from './models';

export class Users extends OpsGenieConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_User',
    'tms_User',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.id,
          email: user.username,
          name: user.fullName,
          source,
        },
      },
      {
        model: 'tms_User',
        record: {
          uid: user.id,
          emailAddress: user.username,
          name: user.fullName,
          source,
        },
      },
    ];
  }
}
