import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureActiveDirectoryConverter} from './common';
import {Group} from './models';

export class Groups extends AzureActiveDirectoryConverter {
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
    const uid = group.id;
    const lead =
      group.owners.length >= 1
        ? {
            uid: group.owners[0],
            source,
          }
        : undefined;

    res.push({
      model: 'org_Team',
      record: {
        uid,
        name: group.displayName,
        description: group.description,
        lead,
        parentTeam: {uid: 'all_teams'}, // TODO: compute parent team
        teamChain: ['all_teams'], // TODO: team chain
        source,
      },
    });

    for (const user of group.members ?? []) {
      res.push({
        model: 'org_TeamMembership',
        record: {
          team: {uid},
          member: {uid: user},
        },
      });
    }
    return res;
  }
}
