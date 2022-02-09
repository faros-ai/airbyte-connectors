import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureActiveDirectoryConverter} from './common';
import {User} from './models';

export class AzureActiveDirectoryUsers extends AzureActiveDirectoryConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'identity_Identity',
    'ims_UserIdentity',
    'org_Employee',
    'tms_UserIdentity',
    'vcs_UserIdentity',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    const joinedAt = Utils.toDate(user.createdDateTime);
    const manager = {
      uid: user.manager ? user.manager.id : '',
      source,
    };
    const res: DestinationRecord[] = [];

    res.push({
      model: 'identity_Identity',
      record: {
        uid: user.id,
        fullName: `${user.givenName} ${user.surname}`,
        primaryEmail: user.mail,
        emails: user.mail,
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
        title: user.displayName,
        level: user.jobTitle,
        joinedAt,
        terminatedAt: null,
        department: user.department,
        identity: {uid: user.mail, source},
        manager,
        reportingChain: null,
        location: {uid: user.streetAddress, source},
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
