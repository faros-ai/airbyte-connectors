import {WorkItemClassificationNode} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';

export class Iterations extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Sprint'];
  private now: Date;

  // Initialize current time once for consistent state calculation across all iterations
  private initialize(): void {
    if (!this.now) {
      this.now = DateTime.now().setZone('UTC').toJSDate();
    }
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize();
    
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
    // Check end date first - if it's in the past, iteration is closed regardless of start date
    if (endDate && endDate < this.now) {
      return 'Closed';
    }
    
    // If we have a start date that's in the future, iteration is future
    if (startDate && startDate > this.now) {
      return 'Future';
    }
    
    // If we're between start and end dates, then we're in an active iteration
    if (startDate && startDate <= this.now && endDate && endDate >= this.now) {
      return 'Active';
    }
    
    // Handle edge case: start date exists and has passed, but no end date
    // Note: Sprints with start date but no end date are treated as Active if started.
    // This handles cases where sprints are created but end date hasn't been set yet,
    // or for indefinite iterations like "Backlog". Azure's exact behavior for this
    // edge case is unclear, but treating started iterations as Active seems reasonable.
    if (startDate && startDate <= this.now && !endDate) {
      return 'Active';
    }
    
    // Default: no dates set, or only future start date, or only future end date
    return 'Future';
  }

  private toEndOfDay(date?: Date): Date {
    return date
      ? DateTime.fromJSDate(date).setZone('UTC').endOf('day').toJSDate()
      : null;
  }
}
