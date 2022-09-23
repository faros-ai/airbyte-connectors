import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {ShortcutConverter} from './common';
import {Member} from './models';
export class Members extends ShortcutConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as Member;
    return [
      {
        model: 'tms_User',
        record: {
          uid: String(user.id),
          name: user.profile.name,
          emailAddress: user.profile.email_address,
          source,
        },
      },
    ];
  }
}
