import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Group, OktaConverter} from './common';

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
          lead: {uid: group.credentials.emails, source},
          color: group._links.logo,
          source,
        },
      },
    ];
  }
}
