import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {ShortcutCommon, ShortcutConverter} from './common';
import {Iteration} from './models';
export class Iterations extends ShortcutConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const iteration = record.record.data as Iteration;
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(iteration.id),
          name: iteration.name,
          state: ShortcutCommon.getSprintState(iteration),
          startedAt: Utils.toDate(iteration.start_date),
          endedAt: Utils.toDate(iteration.end_date),
          source,
        },
      },
    ];
  }
}
