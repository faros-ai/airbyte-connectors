import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Iteration} from './common';

export class ClubhouseIterations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const iteration = record.record.data as Iteration;
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(iteration.id),
          name: iteration.name,
          state: this.getSprintState(iteration),
          startedAt: Utils.toDate(iteration.start_date),
          endedAt: Utils.toDate(iteration.end_date),
          source,
        },
      },
    ];
  }
}
