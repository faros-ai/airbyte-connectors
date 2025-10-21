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
          state: this.toState(
            Iteration.attributes?.timeFrame,
            startedAt,
            closedAt
          ),
          startedAt,
          openedAt,
          endedAt,
          closedAt,
          source: this.source,
        },
      },
    ];
  }

  private toState(state?: string, startedAt?: Date, closedAt?: Date): string {
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
    // Check closed date first - if it's in the past (end of day), iteration is closed
    if (closedAt && closedAt < this.now) {
      return 'Closed';
    }

    // If we have a start date that's in the future, iteration is future
    if (startedAt && startedAt > this.now) {
      return 'Future';
    }

    // If we're past the start date and before/on the close date, iteration is active
    // Use startedAt to make sprint active from the day it starts (not end-of-day)
    // Use closedAt (end-of-day) to keep sprint active through the entire end date
    if (startedAt && startedAt <= this.now && closedAt && closedAt >= this.now) {
      return 'Active';
    }

    // Handle edge case: start date exists and has passed, but no close date
    // Note: Sprints with start date but no end date are treated as Active if started.
    // This handles cases where sprints are created but end date hasn't been set yet,
    // or for indefinite iterations like "Backlog". Azure's exact behavior for this
    // edge case is unclear, but treating started iterations as Active seems reasonable.
    if (startedAt && startedAt <= this.now && !closedAt) {
      return 'Active';
    }

    // Default: no dates set, or only future start date, or only future close date
    return 'Future';
  }

  private toEndOfDay(date?: Date): Date {
    return date
      ? DateTime.fromJSDate(date).setZone('UTC').endOf('day').toJSDate()
      : null;
  }
}
