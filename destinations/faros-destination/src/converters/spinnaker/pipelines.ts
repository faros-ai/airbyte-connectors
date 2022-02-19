import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {SpinnakerConverter} from './common';

export class SpinnakerPipelines extends SpinnakerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    // TODO:
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data;

    // TODO:
    return [];
  }
}
