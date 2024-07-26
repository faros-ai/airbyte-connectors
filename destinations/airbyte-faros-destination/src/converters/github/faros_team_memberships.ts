import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TeamMembership} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosTeamMemberships extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const membership = record.record.data as TeamMembership;
    this.collectUser(membership.user);
    return [
      {
        model: 'vcs_TeamMembership',
        record: {
          team: {uid: membership.team},
          member: {uid: membership.user.login, source: this.streamName.source},
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertUsers()];
  }
}
