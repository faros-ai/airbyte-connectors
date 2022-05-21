import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooHRConverter} from './common';
import {User} from './models';

export class Users extends BambooHRConverter {
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
    const joinedAt = Utils.toDate(user.hireDate);
    const terminatedAt =
      user.terminationDate == '0000-00-00'
        ? 0
        : Utils.toDate(user.terminationDate);
    const manager = user.supervisorId
      ? {uid: user.supervisorId, source}
      : undefined;
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
        fullName: user.fullName1,
        lastName: user.lastName,
        primaryEmail: user.bestEmail,
        emails: [user.bestEmail],
      },
    });

    const location = user.address1 ? {uid: user.address1, source} : undefined;

    if (user.address1) {
      res.push({
        model: 'geo_Address',
        record: {
          uid: user.address1,
          fullAddress: user.address1,
          street: user.address1,
          postalCode: user.zipcode,
        },
      });
      const geo_Location = {
        uid: user.address1,
        name: user.address1,
        raw: user.address1,
        address: {uid: user.address1},
      };
      res.push({model: 'geo_Location', record: geo_Location});
    }
    res.push({
      model: 'org_Employee',
      record: {
        uid,
        title: user.jobTitle,
        level: 0,
        joinedAt,
        department: user.department ? {uid: user.department} : null,
        identity: {uid, source},
        manager,
        location,
        terminatedAt,
        source,
      },
    });
    return res;
  }
}
