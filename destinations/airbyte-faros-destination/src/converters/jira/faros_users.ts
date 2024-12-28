import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';
import {Users as CommunityUsers} from './users';

export class FarosUsers extends JiraConverter {
  private alias = new CommunityUsers();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initializeSource(ctx);
    return this.alias.convert(record, ctx);
  }
}
