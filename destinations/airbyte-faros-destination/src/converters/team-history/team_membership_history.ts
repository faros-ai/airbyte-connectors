import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class TeamMembershipHistory extends Converter {
  source = 'team-history';

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_TeamMembershipHistory',
  ];

  id(): any {
    return undefined;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const data = record.record.data;
    return [
      {
        model: 'org_TeamMembershipHistory',
        record: {
          team: {uid: data.teamUid},
          member: {uid: data.memberUid},
          startedAt: data.startedAt,
          endedAt: data.endedAt,
        },
      },
    ];
  }
}
