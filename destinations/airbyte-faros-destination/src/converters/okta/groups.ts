import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {OktaConverter} from './common';
import {Group} from './models';

export class Groups extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data as Group;
    const res: DestinationRecord[] = [];
    const profile = group.profile;
    const uid = group.id;

    res.push({
      model: 'org_Team',
      record: {
        uid,
        name: profile.name ?? null,
        description: profile.description ?? null,
        lead: null, // TODO: figure out who is the lead
        parentTeam: {uid: 'all_teams'}, // TODO: compute parent team
        teamChain: ['all_teams'], // TODO: team chain
        tags: null,
        color: null,
        photoUrl: null,
        source,
      },
    });

    for (const userId of group?.usersOfGroup ?? []) {
      res.push({
        model: 'org_TeamMembership',
        record: {
          team: {uid},
          member: {uid: userId},
        },
      });
    }
    return res;
  }
}
