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
    const manager = {
      uid: user.profile.managerId
        ? user.profile.managerId
        : user.profile.manager,
      source,
    };
    return [
      {
        model: 'org_Employee',
        record: {
          uid: user.id,
          title: user.profile.title,
          level: user.profile.userType,
          joinedAt,
          // not support
          terminatedAt: '',
          department: user.profile.department,
          identity: {uid: user.credentials.emails[0].value, source},
          manager,
          // not support
          reportingChain: '',
          location: {uid: user.profile.postalAddress, source},
          source,
        },
      },
    ];
  }
}
