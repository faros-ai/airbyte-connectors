import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosTeamMemberships extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const teamMembership = record.record.data;
    const source = this.initializeSource(ctx);
    return [
      {
        model: 'tms_TeamMembership',
        record: {
          team: {uid: teamMembership.teamId, source},
          member: {
            uid: teamMembership.memberId,
            source,
          },
        },
      },
    ];
  }
}
