import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Member} from './common';

export class ClubhouseUsers extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data as Member;
    return [
      {
        model: 'tms_User',
        record: {
          uid: String(user.id),
          name: user.profile.name,
          emailAddress: user.profile.email_address,
          source,
        },
      },
    ];
  }
}
