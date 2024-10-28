import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {LocationCollector} from '../common/geo';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureActiveDirectoryConverter} from './common';
import {User} from './models';

export class Users extends AzureActiveDirectoryConverter {
  private locationCollector: LocationCollector = undefined;
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'geo_Address',
    'geo_Coordinates',
    'geo_Location',
    'identity_Identity',
    'org_Department',
    'org_Employee',
  ];

  private seenDepartments = new Set<string>();

  private initialize(ctx: StreamContext) {
    if (this.locationCollector) {
      return;
    }
    this.locationCollector = new LocationCollector(
      ctx?.config?.source_specific_configs?.azureactivedirectory?.resolve_locations,
      ctx.farosClient
    );
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);

    const source = this.streamName.source;
    const user = record.record.data as User;
    const joinedAt = Utils.toDate(user.employeeHireDate);
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

    const location = await this.locationCollector.collect(
      user.officeLocation || user.streetAddress
    );
    res.push({
      model: 'org_Employee',
      record: {
        uid,
        title: user.jobTitle,
        joinedAt,
        terminatedAt: Utils.toDate(user.employeeLeaveDateTime),
        inactive: user.employeeLeaveDateTime ? true : null,
        department: user.department ? {uid: user.department} : null,
        identity: {uid, source},
        manager,
        location,
        source,
      },
    });
    return res;
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return this.locationCollector.convertLocations();
  }
}
