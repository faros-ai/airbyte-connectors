import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ServiceNowConverter} from './common';

export class Users extends ServiceNowConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user?.sys_id?.value,
          email: user?.email?.value,
          name: user?.name?.value,
          source,
        },
      },
    ];
  }
}
