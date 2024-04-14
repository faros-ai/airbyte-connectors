import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ZendeskConverter} from './common';

export class Groups extends ZendeskConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Team'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.zendeskConfig(ctx)?.sync_groups) {
      return [];
    }

    const group = record.record.data;
    const orgTeam = this.orgTeam(ctx, group);
    if (!orgTeam) {
      return [];
    }

    return [
      {
        model: 'org_Team',
        record: {...orgTeam},
      },
    ];
  }
}
