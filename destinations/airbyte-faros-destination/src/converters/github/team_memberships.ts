import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class TeamMemberships extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_TeamMember',
    'vcs_User',
    'vcs_Team'
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const membership = record.record.data;
    const res: DestinationRecord[] = [];


    let team = {
        slug: membership.team_slug,
        source
    }
    let user = {
        uid: membership.username,
        source
    }

    res.push({
      model: "vcs_Team",
      record: team
    });
    res.push({
      model: "vcs_User",
      record: user
    });

    res.push({
      model: 'vcs_TeamMember',
      record: {
        state: membership.state,
        role: membership.role,
        user,
        team,
        source,
      },
    });

    return res;
  }
}
