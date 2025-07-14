import {WorkItemClassificationNode} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';

export class Iterations extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const Iteration = record.record.data as WorkItemClassificationNode;
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
          state: this.toState(Iteration.attributes?.timeFrame, startedAt, endedAt),
          startedAt,
          openedAt,
          endedAt,
          closedAt,
          source: this.source,
        },
      },
    ];
  }

  private toState(state?: string, startDate?: Date, endDate?: Date): string {
    // If timeFrame is provided (backward compatibility), use it
    if (state) {
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

    // Calculate state based on dates if timeFrame is not available
    if (!startDate && !endDate) {
      // No dates set - consider it future per Azure DevOps logic
      return 'Future';
    }

    const now = DateTime.now().setZone('UTC').toJSDate();
    
    // If we have an end date and it's in the past, iteration is closed
    if (endDate && endDate < now) {
      return 'Closed';
    }
    
    // If we have a start date that's in the future, iteration is future
    if (startDate && startDate > now) {
      return 'Future';
    }
    
    // If we're between start and end dates (or only have start date that's passed)
    // then we're in an active iteration
    if (startDate && startDate <= now) {
      if (!endDate || endDate >= now) {
        return 'Active';
      }
    }
    
    // Default to Future if we can't determine
    return 'Future';
  }

  private toEndOfDay(date?: Date): Date {
    return date
      ? DateTime.fromJSDate(date).setZone('UTC').endOf('day').toJSDate()
      : null;
  }
}
