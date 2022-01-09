import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OktaConverter} from './common';
import {Group} from './models';

export class OktaGroups extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Team'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const group = record.record.data as Group;
    return [
      {
        model: 'org_Team',
        record: {
          uid: group.id,
          name: group.profile.name,
          description: group.profile.description,
          lead: {uid: group.usersOfGroup[0].id, source},
          // not support
          parentTeam: '',
          // not support
          teamChain: '',
          // not support
          tags: '',
          // not support
          color: '',
          photoUrl: group._links.logo[0].href,
          source,
        },
      },
    ];
  }
}
