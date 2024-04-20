import {AirbyteRecord} from '../../../../../faros-airbyte-cdk/lib';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {User} from './models';

export class Users extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const userItem = record.record.data as User;
    const organizationName = this.getOrganizationFromUrl(userItem.url);
    const organization = {uid: organizationName, source};
    const res: DestinationRecord[] = [];

    res.push({
      model: 'tms_User',
      record: {
        uid: userItem.principalName,
        name: userItem.displayName,
        emailAddress: userItem.mailAddress,
        source,
        organization,
      },
    });
    return res;
  }
}
