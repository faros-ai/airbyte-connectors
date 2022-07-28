import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {intersection, uniq} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooHRConverter} from './common';
import {User} from './models';

export class Users extends BambooHRConverter {
  private logger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'geo_Address',
    'geo_Location',
    'identity_Identity',
    'org_Department',
    'org_Employee',
    'org_Team',
    'org_TeamMembership',
  ];

  private seenDepartments = new Set<string>();
  private managers = new Map<string, string>();
  private employeeIdsToNames = new Map<string, string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;
    const uid = user.id;
    let joinedAt = Utils.toDate(user.hireDate);
    if (isNaN(joinedAt?.getTime())) {
      this.logger.warn(
        `Found unexpected hire date ${user.hireDate} for user id ${user.id}`
      );
      joinedAt = null;
    }
    let terminatedAt: Date;
    if (user.terminationDate === '0000-00-00') {
      terminatedAt = null;
    } else {
      terminatedAt = Utils.toDate(user.terminationDate);
      if (isNaN(terminatedAt?.getTime())) {
        this.logger.warn(
          `Found unexpected hire date ${user.terminationDate} for user id ${user.id}`
        );
        terminatedAt = null;
      }
    }
    const manager = user.supervisorEId ? {uid: user.supervisorEId} : undefined;
    const res: DestinationRecord[] = [];

    if (this.bootstrapTeamsFromManagers(ctx)) {
      this.employeeIdsToNames.set(uid, user.fullName1);
      if (manager) {
        this.managers.set(uid, manager.uid);
        res.push({
          model: 'org_TeamMembership',
          record: {
            team: {uid: manager.uid},
            member: {uid},
          },
        });
      }
    }

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
        firstName: user.firstName,
        fullName: user.fullName1,
        lastName: user.lastName,
        primaryEmail: user.bestEmail ?? user.workEmail,
        emails: uniq([user.bestEmail, user.workEmail].filter((e) => e)),
      },
    });

    const fullAddress = [
      user.address1,
      user.address2,
      user.city,
      user.stateCode ?? user.state,
      user.country,
      user.zipcode,
    ]
      .filter((a) => a)
      .join(', ');
    const location = fullAddress ? {uid: fullAddress} : undefined;

    if (fullAddress) {
      res.push({
        model: 'geo_Address',
        record: {
          uid: fullAddress,
          fullAddress,
          street: user.address1,
          postalCode: user.zipcode,
          city: user.city,
          state: user.state,
          stateCode: user.stateCode,
          country: user.country,
        },
      });
      const geo_Location = {
        uid: fullAddress,
        name: fullAddress,
        raw: fullAddress,
        address: {uid: fullAddress},
      };
      res.push({model: 'geo_Location', record: geo_Location});
    }
    res.push({
      model: 'org_Employee',
      record: {
        uid,
        title: user.jobTitle,
        joinedAt: new Date('sdf'),
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

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    if (!this.bootstrapTeamsFromManagers(ctx)) return res;

    for (const uid of intersection(
      Array.from(this.managers.values()),
      Array.from(this.employeeIdsToNames.keys())
    )) {
      const parentTeamId = this.managers.get(uid);
      res.push({
        model: 'org_Team',
        record: {
          uid,
          name: `${this.employeeIdsToNames.get(uid)} Org`,
          lead: {uid},
          parentTeam: parentTeamId ? {uid: parentTeamId} : null,
        },
      });
      res.push({
        model: 'org_TeamMembership',
        record: {
          team: {uid},
          member: {uid},
        },
      });
    }
    return res;
  }
}
