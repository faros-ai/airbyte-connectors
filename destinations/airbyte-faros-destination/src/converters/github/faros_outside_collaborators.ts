import {AirbyteRecord} from 'faros-airbyte-cdk';
import {OutsideCollaborator} from 'faros-airbyte-common/lib/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosOutsideCollaborators extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
    'vcs_UserEmail',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const collaborator = record.record.data as OutsideCollaborator;
    this.collectUser(collaborator);
    return [];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
