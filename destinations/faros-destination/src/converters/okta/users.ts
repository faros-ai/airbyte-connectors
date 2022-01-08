import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter,User} from './common';

export class OktaUsers extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    return [
      {
        model: 'tms_User',
        record: {
          uid: String(user.id),
          name: user.profile.firstName,
          emailAddress: user.profile.email,
          source,
        },
      },
    ];
  }
}
