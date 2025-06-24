import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkspaceUser} from 'faros-airbyte-common/googledrive';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GoogleDriveConverter} from './common';

export class WorkspaceUsers extends GoogleDriveConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'dms_User',
    'dms_Membership',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as WorkspaceUser;

    return [
      {
        model: 'dms_User',
        record: {
          uid: user.id,
          source,
          name: user.name?.fullName,
          email: user.primaryEmail,
          type: {
            category: 'User',
            detail: null,
          },
          createdAt: Utils.toDate(user.creationTime),
        },
      },
      {
        model: 'dms_Membership',
        record: {
          organization: {
            uid: user.customerId,
            source,
          },
          user: {
            uid: user.id,
            source,
          },
        },
      }
    ];
  }
}
