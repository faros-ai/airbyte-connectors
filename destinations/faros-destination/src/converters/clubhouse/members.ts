import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Member} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Member'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const member = record.record.data as Member;
    return [
      {
        model: 'tms_Member',
        record: {
          uid: member.id,
          role: member.role,
          profile: member.profile,
          disabled: member.disabled,

          source,
        },
      },
    ];
  }
}
