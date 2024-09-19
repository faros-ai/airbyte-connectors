import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkspaceUser} from 'faros-airbyte-common/bitbucket';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';

export class WorkspaceUsers extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const workspaceUser = record.record.data as WorkspaceUser;

    const user = BitbucketCommon.vcsUser(workspaceUser.user, source);
    if (!user) return [];

    return [
      user,
      {
        model: 'vcs_Membership',
        record: {
          user: {uid: workspaceUser.user.accountId, source},
          organization: {
            uid: workspaceUser.workspace.slug.toLowerCase(),
            source,
          },
        },
      },
    ];
  }
}
