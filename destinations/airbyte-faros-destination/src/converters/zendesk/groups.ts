import {AirbyteRecord} from 'faros-airbyte-cdk';
import {trim} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ZendeskConverter} from './common';

export class Groups extends ZendeskConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Team'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const group = record.record.data;
    const uid = this.orgTeam(ctx, group);
    return [
      {
        model: 'org_Team',
        record: {
          uid,
          name: group.name,
          description: group.description,
        },
      },
    ];
  }
}
