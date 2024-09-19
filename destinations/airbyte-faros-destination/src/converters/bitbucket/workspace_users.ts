import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkspaceUser} from 'faros-airbyte-common/bitbucket';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter, UserTypeCategory} from './common';

export class WorkspaceUsers extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const {user, workspace} = record.record.data as WorkspaceUser;

    if (!user?.accountId) return [];

    const userType =
      user.type === 'user'
        ? {category: UserTypeCategory.USER, detail: 'user'}
        : {category: UserTypeCategory.CUSTOM, detail: user.type};

    return [
      {
        model: 'vcs_User',
        record: {
          uid: user.accountId,
          name: user.displayName,
          email: user.emailAddress,
          type: userType,
          htmlUrl: user.links?.htmlUrl,
          source,
        },
      },
      {
        model: 'vcs_Membership',
        record: {
          user: {uid: user.accountId, source},
          organization: {
            uid: toLower(workspace.slug),
            source,
          },
        },
      },
    ];
  }
}
