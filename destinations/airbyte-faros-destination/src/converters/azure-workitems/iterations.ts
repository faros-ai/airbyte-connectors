import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Iteration} from './models';

export class Iterations extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const Iteration = record.record.data as Iteration;
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(Iteration.id),
          name: Iteration.name,
          state: this.toState(Iteration.attributes.timeFrame),
          startedAt: Utils.toDate(Iteration.attributes.startDate),
          openedAt: Utils.toDate(Iteration.attributes.startDate),
          endedAt: Utils.toDate(Iteration.attributes.finishDate),
          closedAt: Utils.toDate(Iteration.attributes.finishDate),
        },
      },
    ];
  }

  private toState(state?: string): string {
    if (!state) return null;

    switch (state.toLowerCase()) {
      case 'current':
        return 'Active';
      case 'past':
        return 'Closed';
      case 'future':
        return 'Future';
      default:
        return state;
    }
  }
}
