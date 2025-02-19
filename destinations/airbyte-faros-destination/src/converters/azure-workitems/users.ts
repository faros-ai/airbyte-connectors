import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {User} from './models';
import {Common} from '../common/common';

export class Users extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const userItem = record.record.data as User;
    const res: DestinationRecord[] = [];

    const email = userItem.mailAddress ?? userItem.uniqueName;
    res.push({
      model: 'tms_User',
      record: {
        uid: userItem.principalName ?? userItem.uniqueName,
        name: userItem.displayName,
        emailAddress: Common.isEmail(email) ? email : null,
        source,
      },
    });
    return res;
  }
}
