import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearCommon, LinearConverter} from './common';
import {Cycle} from './models';

export class Cycles extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const cycle = record.record.data as Cycle;
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: cycle.id,
          name: cycle.name,
          description: cycle.name,
          startedAt: Utils.toDate(cycle.createdAt),
          endedAt: Utils.toDate(cycle.completedAt),
          completedPoints: cycle.progress,
          state: LinearCommon.getSprintState(cycle.completedAt),
          source,
        },
      },
    ];
  }
}
