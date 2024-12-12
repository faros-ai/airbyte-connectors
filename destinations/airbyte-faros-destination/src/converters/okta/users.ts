import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {sortBy} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {OktaConverter} from './common';
import {User} from './models';

export class Users extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'identity_Identity',
    'org_Department',
    'org_Employee',
  ];

  private seenDepartments = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    const profile = user.profile;
    const uid = user.id;
    const res: DestinationRecord[] = [];

    const fullName = [profile.firstName, profile.middleName, profile.lastName]
      .filter((x) => x)
      .join(' ');

    const joinedAt =
      Utils.toDate(profile.startDate) ?? Utils.toDate(user.created) ?? null;

    const departments = sortBy(
      Object.entries(profile).filter(([k, v]) =>
        k.toLowerCase().includes('department')
      ),
      ([k, v]) => k
    ).map(([k, v]) => v);

    const department =
      (departments.length > 0 ? departments[0] : null) ??
      profile.department ??
      null;

    if (department && !this.seenDepartments.has(department)) {
      this.seenDepartments.add(department);
      res.push({
        model: 'org_Department',
        record: {
          uid: department,
          name: department,
          description: null,
        },
      });
    }

    res.push(
      {
        model: 'identity_Identity',
        record: {
          uid,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName,
          photoUrl: null,
          primaryEmail: profile.email,
          emails: [profile.email],
          createdAt: null,
          updatedAt: null,
        },
      },
      {
        model: 'org_Employee',
        record: {
          uid,
          title: profile.title,
          level: null,
          joinedAt,
          terminatedAt: null,
          department: {uid: department},
          identity: {uid, source},
          manager: profile.manager ? {uid: profile.manager, source} : null,
          reportingChain: null, // TODO: compute reporting chain
          location: null, // TODO: lookup location
          source,
        },
      }
    );

    return res;
  }
}
