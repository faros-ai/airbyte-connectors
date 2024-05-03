import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Boards as CommunityBoards} from './boards';
import {JiraConverter} from './common';

export class FarosBoards extends JiraConverter {
  private alias = new CommunityBoards();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record, ctx);
  }
}
