import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Iteration} from './models';

export class Iterations extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const Iteration = record.record.data as Iteration;
    const startedAt = Iteration.attributes?.startDate
      ? Utils.toDate(Iteration.attributes.startDate)
      : null;

    const endedAt = Iteration.attributes?.finishDate
      ? Utils.toDate(Iteration.attributes.finishDate)
      : null;
    // Set the openedAt and closedAt dates to the end of the day
    const openedAt = this.toEndOfDay(startedAt);
    const closedAt = this.toEndOfDay(endedAt);

    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: String(Iteration.id),
          name: Iteration.name,
          description: Utils.cleanAndTruncate(Iteration.path),
          state: this.toState(Iteration.attributes?.timeFrame),
          startedAt,
          openedAt,
          endedAt,
          closedAt,
          source: this.source,
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

  private toEndOfDay(date?: Date): Date {
    return date
      ? DateTime.fromJSDate(date).setZone('UTC').endOf('day').toJSDate()
      : null;
  }
}
