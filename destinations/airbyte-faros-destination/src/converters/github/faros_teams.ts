import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Team} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

const DEFAULT_ROOT_TEAM_ID = 'all_teams';

export class FarosTeams extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Team'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const team = record.record.data as Team;
    return [
      {
        model: 'vcs_Team',
        record: {
          uid: team.slug,
          name: team.name,
          description: Utils.cleanAndTruncate(team.description),
          lead: null,
          parentTeam: team.parentSlug
            ? {uid: team.parentSlug}
            : {uid: DEFAULT_ROOT_TEAM_ID},
        },
      },
    ];
  }
}
