import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {SquadcastConverter, User} from './common';

export class Users extends SquadcastConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

    const username = `${user.first_name} ${user.last_name}`;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.id,
          email: user.email,
          name: username,
          source,
        },
      },
    ];
  }
}
