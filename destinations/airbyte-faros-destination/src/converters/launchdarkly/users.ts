import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyUser} from './common';

export class Users extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user: LaunchDarklyUser = record.record.data as LaunchDarklyUser;

    return [
      {
        model: 'ffs_User',
        record: {
          id: user.key,
          name: user.name || null,
          email: user.email || null,
          country: user.country || null,
          source,
        },
      },
    ];
  }
}
