import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {toGroupUid,ZendeskConverter} from './common';

export class Groups extends ZendeskConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Team'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const group = record.record.data;
    return [
      {
        model: 'org_Team',
        record: {
          uid: toGroupUid(group.id),
          name: group.name,
          description: group.description,
        },
      },
    ];
  }
}
