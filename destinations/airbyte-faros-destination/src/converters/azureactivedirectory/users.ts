import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureactivedirectoryConverter} from './common';
import {User} from './models';

export class Users extends AzureactivedirectoryConverter {
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
    const manager = {
      uid: user.manager ?? '',
      source,
    };
    const uid = user.id;
    const res: DestinationRecord[] = [];

    if (user.department && !this.seenDepartments.has(user.department)) {
      this.seenDepartments.add(user.department);
      res.push({
        model: 'org_Department',
        record: {
          uid: user.department,
          name: user.department,
          description: null,
        },
      });
    }

    res.push({
      model: 'identity_Identity',
      record: {
        uid,
        fullName: `${user.givenName} ${user.surname}`,
        lastName: user.surname,
        photoUrl: null,
        primaryEmail: user.mail,
        emails: [user.mail],
        createdAt: null,
        updatedAt: null,
      },
    });

    res.push({
      model: 'org_Employee',
      record: {
        uid,
        title: user.displayName,
        level: 0,
        joinedAt,
        terminatedAt: null,
        department: {uid: user.department},
        identity: {uid: user.mail, source},
        manager,
        reportingChain: null,
        location: {uid: user.streetAddress, source},
        source,
      },
    });
    return res;
  }
}
