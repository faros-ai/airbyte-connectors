import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearConverter} from './common';
import {User} from './models';

export class Users extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    return [
      {
        model: 'tms_User',
        record: {
          uid: user.id,
          name: user.name,
          emailAddress: user.email,
          source,
        },
      },
    ];
  }
}
