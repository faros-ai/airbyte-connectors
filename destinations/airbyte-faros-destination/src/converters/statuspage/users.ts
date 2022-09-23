import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {StatuspageConverter} from './common';

export class Users extends StatuspageConverter {
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
          uid: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          source,
        },
      },
    ];
  }
}
