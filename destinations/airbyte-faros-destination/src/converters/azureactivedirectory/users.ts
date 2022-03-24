import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureActiveDirectoryConverter} from './common';
import {User} from './models';

export class Users extends AzureActiveDirectoryConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'geo_Address',
    'geo_Location',
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
    const manager = user.manager ? {uid: user.manager, source} : undefined;
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

    const location = user.streetAddress
      ? {uid: user.streetAddress, source}
      : undefined;

    if (user.streetAddress) {
      res.push({
        model: 'geo_Address',
        record: {
          uid: user.streetAddress,
          fullAddress: user.streetAddress,
          street: user.streetAddress,
          postalCode: user.postalCode,
        },
      });
      const geo_Location = {
        uid: user.streetAddress,
        name: user.streetAddress,
        raw: user.streetAddress,
        address: {uid: user.streetAddress},
      };
      res.push({model: 'geo_Location', record: geo_Location});
    }
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
