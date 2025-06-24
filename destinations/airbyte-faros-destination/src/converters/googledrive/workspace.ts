import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkspaceCustomer} from 'faros-airbyte-common/googledrive';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GoogleDriveConverter} from './common';

export class Workspace extends GoogleDriveConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'dms_Organization',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workspace = record.record.data as WorkspaceCustomer;

    return [
      {
        model: 'dms_Organization',
        record: {
          uid: workspace.id,
          source,
          name: workspace.postalAddress?.organizationName,
          domain: workspace.customerDomain,
          createdAt: Utils.toDate(workspace.customerCreationTime),
        },
      },
    ];
  }
}
