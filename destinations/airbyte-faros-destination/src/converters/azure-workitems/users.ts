import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/azure-devops';

import {getUniqueName} from '../common/azure-devops';
import {Common} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';

export class Users extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const userItem = record.record.data as User;
    const res: DestinationRecord[] = [];

    const uniqueName = getUniqueName(userItem);
    if (!uniqueName) {
      return res;
    }

    const email = this.getEmail(userItem);
    res.push({
      model: 'tms_User',
      record: {
        uid: uniqueName,
        name: userItem.displayName,
        emailAddress: Common.isEmail(email) ? email : null,
        source,
      },
    });
    return res;
  }

  private getEmail(userItem: User): string | null {
    if ('mailAddress' in userItem && Boolean(userItem.mailAddress)) {
      return userItem.mailAddress;
    }
    if ('uniqueName' in userItem && Boolean(userItem.uniqueName)) {
      return userItem.uniqueName;
    }
  }
}
