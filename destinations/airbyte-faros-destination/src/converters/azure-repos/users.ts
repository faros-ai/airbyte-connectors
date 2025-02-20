import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter} from './common';
import {User, UserType, UserTypeCategory} from './models';

export class Users extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  private checkUserItemValidity(userItem: User): boolean {
    // Add checks to record in this function
    return !!userItem.principalName || !!userItem.uniqueName;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const userItem = record.record.data as User;
    const res: DestinationRecord[] = [];
    if (!this.checkUserItemValidity(userItem)) {
      return res;
    }

    const url = userItem._links?.self?.href ?? userItem.url;
    const organizationName = this.getOrganizationFromUrl(url);
    const organization = {uid: organizationName, source};
    const type: UserType = {
      category: UserTypeCategory.User,
      detail: userItem.subjectKind,
    };
    // Support both principalName and uniqueName for AzureDevOps Server
    const uniqueName = userItem.principalName ?? userItem.uniqueName;
    const uid = uniqueName.toLowerCase();
    res.push({
      model: 'vcs_Membership',
      record: {
        organization,
        user: {uid, source},
      },
    });
    res.push({
      model: 'vcs_User',
      record: {
        uid,
        name: userItem.displayName,
        email: userItem.mailAddress,
        type,
        htmlUrl: userItem.url,
        source,
      },
    });
    this.uidsFromUsersStream.add(uid);
    return res;
  }
}
