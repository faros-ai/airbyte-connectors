import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/azure-devops';

import {getOrganizationFromUrl} from '../common/azure-devops';
import {CategoryDetail} from '../common/common';
import {UserTypeCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter} from './common';

export class Users extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  private checkUserItemValidity(userItem: User): boolean {
    return Boolean(this.getUniqueName(userItem));
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
    const organizationName = getOrganizationFromUrl(url);
    const organization = {uid: organizationName, source};
    const type: CategoryDetail = {
      category: UserTypeCategory.User,
      detail: 'subjectKind' in userItem ? userItem.subjectKind : null,
    };

    const uniqueName = this.getUniqueName(userItem);
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
        email: 'mailAddress' in userItem ? userItem.mailAddress : undefined,
        type,
        htmlUrl: userItem.url,
        source,
      },
    });
    this.uidsFromUsersStream.add(uid);
    return res;
  }

  // Support both principalName and uniqueName for AzureDevOps Server
  private getUniqueName(userItem: User): string | undefined {
    if ('principalName' in userItem && Boolean(userItem.principalName)) {
      return userItem.principalName;
    }
    if ('uniqueName' in userItem && Boolean(userItem.uniqueName)) {
      return userItem.uniqueName;
    }
    return undefined;
  }
}
