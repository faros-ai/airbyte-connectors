import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {ServiceNowConverter} from './common';

export class Users extends ServiceNowConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user.sys_id,
          email: user.email,
          name: user.name,
          source,
        },
      },
    ];
  }
}
