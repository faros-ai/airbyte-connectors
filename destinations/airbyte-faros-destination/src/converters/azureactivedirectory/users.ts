import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureActiveDirectoryConverter} from './common';
import {User} from './models';

export class Users extends AzureActiveDirectoryConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'identity_Identity',
    'org_Department',
    'org_Employee',
  ];

  private seenDepartments = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    const joinedAt = Utils.toDate(user.createdDateTime);
    const manager =
      user.manager.length >= 1 ? {uid: user.manager[0], source} : undefined;
    const uid = user.id;
    const res: DestinationRecord[] = [];

    if (user.department && !this.seenDepartments.has(user.department)) {
      this.seenDepartments.add(user.department);
      res.push({
        model: 'org_Department',
        record: {
          uid: user.department,
          name: user.department,
        },
      });
    }

    res.push({
      model: 'identity_Identity',
      record: {
        uid,
        fullName: `${user.givenName} ${user.surname}`,
        lastName: user.surname,
        primaryEmail: user.mail,
        emails: [user.mail],
      },
    });

    const location = {uid: user.streetAddress, source};
    res.push({
      model: 'org_Employee',
      record: {
        uid,
        title: user.displayName,
        level: 0,
        joinedAt,
        department: {uid: user.department},
        identity: {uid, source},
        manager,
        location,
        source,
      },
    });
    return res;
  }
}
