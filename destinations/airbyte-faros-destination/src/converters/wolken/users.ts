import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/wolken';

import {DestinationModel, DestinationRecord} from '../converter';
import {WolkenConverter} from './common';

export class Users extends WolkenConverter {
  id(record: AirbyteRecord) {
    return record?.record?.data?.userPsNo;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.userId.toString(),
          email: user.userEmail ?? user.userPsNo,
          name: `${user.userFname} ${user.userLname}`,
          source,
        },
      },
    ];
  }
}
