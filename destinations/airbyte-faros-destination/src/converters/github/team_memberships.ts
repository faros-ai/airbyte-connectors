import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';

export class TeamMemberships extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_TeamMembership',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const membership = record.record.data;
    const res: DestinationRecord[] = [];

    const team = {
      uid: toLower(membership.team_slug),
      source,
    };
    const user = {
      uid: membership.username,
      source,
    };

    res.push({
      model: 'vcs_User',
      record: user,
    });

    res.push({
      model: 'vcs_TeamMembership',
      record: {
        user,
        team,
      },
    });

    return res;
  }
}
