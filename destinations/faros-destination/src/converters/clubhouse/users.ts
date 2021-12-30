import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Member} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const member = record.record.data as Member;
    return [
      {
        model: 'tms_User',
        record: {
          uid: member.id,
          emailAddress: member.profile.email_address,
          name: member.profile.name,
          source,
        },
      },
    ];
  }
}
