import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubCollaborators extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;

    return GithubCommon.vcs_User_with_Membership(user, source);
  }
}
