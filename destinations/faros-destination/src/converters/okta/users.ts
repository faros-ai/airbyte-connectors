import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter, User} from './common';

export class OktaUsers extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Employee',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    const joinedAt = Utils.toDate(user.created);
    const terminatedAt = Utils.toDate(user.lastUpdated);
    return [
      {
        model: 'org_Employee',
        record: {
          uid: user.id,
          level: user.type,
          joinedAt,
          terminatedAt,
          name: user.profile.firstName,
          emailAddress: user.profile.email,
          source,
        },
      },
    ];
  }
}
