import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {BacklogConverter} from './common';
import {User} from './models';

export class Users extends BacklogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    return [
      {
        model: 'tms_User',
        record: {
          uid: String(user.id),
          name: user.name,
          emailAddress: user.mailAddress,
          source,
        },
      },
    ];
  }
}
