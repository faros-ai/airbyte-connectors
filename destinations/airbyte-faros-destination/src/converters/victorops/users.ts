import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {VictorOpsConverter} from './common';

export class Users extends VictorOpsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.username;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data;

    if (user.username.startsWith('invited')) {
      return [];
    }
    return [
      {
        model: 'ims_User',
        record: {
          uid: user.username,
          email: user.email,
          name: user.displayName,
          source,
        },
      },
    ];
  }
}
