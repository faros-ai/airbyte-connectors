import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {ZendeskSupportConverter} from './common';

export class Users extends ZendeskSupportConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskTag',
    'tms_TaskAssignment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data;
    if (!user.id) {
      return [];
    }
    return [
      {
        model: 'tms_User',
        record: {
          uid: toString(user.id),
          name: user.name,
          emailAddress: user.email,
          inactive: user.active === false || user.suspended ? true : false,
          source: this.source,
        },
      },
    ];
  }
}
