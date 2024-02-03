import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ZendeskSupportConverter} from './common';

export class TicketMetrics extends ZendeskSupportConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [];
  }
}
