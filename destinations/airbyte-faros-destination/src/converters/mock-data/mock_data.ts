import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {FarosFeed as OriginalFarosFeed} from '../faros-feeds/faros_feed';

/**
 * This converter is identical to FarosFeed converter.
 * It is here to allow users specifying 'faros_feed' as stream prefix in their source.
 */
export class MockData extends Converter {
  source = 'MockData';
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
