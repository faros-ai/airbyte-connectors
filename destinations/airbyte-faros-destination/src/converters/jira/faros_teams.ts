import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosTeams extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Team'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const team = record.record.data;
    const allTeamsUid = 'all_teams';
    return [
      {
        model: 'tms_Team',
        record: {
          uid: team.id,
          name: team.displayName,
          parentTeam: {uid: allTeamsUid},
          teamChain: [team.id, allTeamsUid],
          source: this.initializeSource(ctx),
        },
      },
    ];
  }
}
