import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Task} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Tasks extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const task = record.record.data as Task;
    const source = this.streamName.source;
    const uid = task.id;
    const results: DestinationRecord[] = [];
    return results;
  }
}
