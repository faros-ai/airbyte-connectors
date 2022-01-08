import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Group,OktaConverter} from './common';

export class OktaGroups extends OktaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Group'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const group = record.record.data as Group;
    return [
      {
        model: 'tms_Group',
        record: {
          uid: group.id,
          name: group.profile.name,
          description: group.profile.description,
          source,
        },
      },
    ];
  }
}
