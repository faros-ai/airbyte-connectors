import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearConverter} from './common';
import {Team} from './models';

export class Teams extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Team',
    'tms_TeamMembership',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const team = record.record.data as Team;

    const maxDescriptionLength = this.maxDescriptionLength(ctx);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'tms_Team',
      record: {
        uid: team.id,
        name: team.name,
        description: team.description?.substring(0, maxDescriptionLength),
        source,
      },
    });
    for (const member of team.members ?? []) {
      res.push({
        model: 'tms_TeamMembership',
        record: {
          team: {uid: team.id},
          member: {uid: member.id, source},
        },
      });
    }
    return res;
  }
}
