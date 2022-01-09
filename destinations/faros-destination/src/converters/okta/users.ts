import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter} from './common';
import {User} from './models';

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
          title: user.profile.firstName,
          level: user.type,
          joinedAt,
          terminatedAt,
          // not support
          department: '',
          identity: {uid: user.id, source},
          // not support
          manager: '',
          // not support
          reportingChain: '',
          location: '',
          // not support
          name: user.profile.firstName,
          emailAddress: user.profile.email,
          source,
        },
      },
    ];
  }
}
