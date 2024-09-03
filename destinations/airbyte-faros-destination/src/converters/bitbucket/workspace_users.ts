import {AirbyteRecord} from 'faros-airbyte-cdk';
import {WorkspaceUser} from 'faros-airbyte-common/bitbucket';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter} from './common';

export class WorkspaceUsers extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const workspaceUser = record.record.data as WorkspaceUser;
    this.collectUser(workspaceUser.user, workspaceUser.workspace.slug);
    return [];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
