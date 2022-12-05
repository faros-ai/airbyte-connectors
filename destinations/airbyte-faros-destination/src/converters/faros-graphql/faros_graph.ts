import {AirbyteRecord} from 'faros-airbyte-cdk/lib';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {FarosFeed as OriginalFarosFeed} from '../faros-feeds/faros_feed';

/**
 * This converter is identical to FarosFeed converter.
 * It is just a wrapper to use the appropriate source/stream name.
 */
export class FarosGraph extends Converter {
  source = 'Faros-GraphQL';
  private alias = new OriginalFarosFeed();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  id(): any {
    return this.alias.id();
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record, ctx);
  }
}
