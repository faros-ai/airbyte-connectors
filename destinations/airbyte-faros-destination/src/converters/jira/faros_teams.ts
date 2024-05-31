import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosTeams extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Team',
    'tms_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const team = record.record.data;
    const results: DestinationRecord[] = [
      {
        model: 'tms_Team',
        record: {
          uid: team.id,
          name: team.displayName,
          parentTeam: {uid: 'all_teams'},
          teamChain: [team.id, 'all_teams'],
          source: this.streamName.source,
        },
      },
    ];
    if (team.members) {
      for (const member of team.members) {
        results.push({
          model: 'tms_TeamMembership',
          record: {
            team: {uid: team.id, source: this.streamName.source},
            member: {uid: member.accountId, source: this.streamName.source},
          },
        });
      }
    }
    return results;
  }
}
