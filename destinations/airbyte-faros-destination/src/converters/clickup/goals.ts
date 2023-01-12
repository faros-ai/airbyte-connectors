import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Goal} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Goals extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const goal = record.record.data as Goal;
    const source = this.streamName.source;
    const uid = goal.id;
    const results: DestinationRecord[] = [];
    return results;
  }
}
