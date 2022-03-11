import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {VictoropsConverter} from './common';

export class Users extends VictoropsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.username;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
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
