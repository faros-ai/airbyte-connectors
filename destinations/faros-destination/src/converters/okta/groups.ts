import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter} from './common';
import {Group} from './models';

export class OktaGroups extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'org_TeamMembership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data as Group;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'org_Team',
      record: {
        uid: group.id,
        name: group.profile.name,
        description: group.profile.description,
        lead: null,
        parentTeam: null,
        teamChain: null,
        tags: null,
        color: null,
        photoUrl: group._links.logo[0].href,
        source,
      },
    });

    for (const user of group.usersOfGroup ?? []) {
      res.push({
        model: 'org_TeamMembership',
        record: {
          team: {uid: group.id},
          member: {uid: user.id},
        },
      });
    }
    return res;
  }
}
