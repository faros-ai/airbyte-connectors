import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter} from './common';
import {User} from './models';

export class OktaUsers extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'identity_Identity',
    'ims_UserIdentity',
    'org_Employee',
    'tms_UserIdentity',
    'vcs_UserIdentity',
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
    const res: DestinationRecord[] = [];
    res.push({
      model: 'identity_Identity',
      record: {
        uid: user.id,
        fullName: `${user.profile.firstName} ${user.profile.middleName} ${user.profile.lastName}`,
        primaryEmail: user.profile.email,
        emails: user.credentials.emails,
      },
    });
    res.push({
      model: 'ims_UserIdentity',
      record: {
        imsUser: {uid: user.id, source},
        identity: {uid: user.id},
      },
    });
    res.push({
      model: 'org_Employee',
      record: {
        uid: user.id,
        title: user.profile.title,
        level: user.profile.userType,
        joinedAt,
        terminatedAt: '',
        department: user.profile.department,
        identity: {uid: user.credentials.emails[0].value, source},
        manager,
        reportingChain: '',
        location: {uid: user.profile.postalAddress, source},
        source,
      },
    });
    res.push({
      model: 'tms_UserIdentity',
      record: {
        tmsUser: {uid: user.id, source},
        identity: {uid: user.id},
      },
    });
    res.push({
      model: 'vcs_UserIdentity',
      record: {
        vcsUser: {uid: user.id, source},
        identity: {uid: user.id},
      },
    });
    return res;
  }
}
