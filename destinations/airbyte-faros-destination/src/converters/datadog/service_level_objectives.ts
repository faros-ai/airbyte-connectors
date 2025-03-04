import {v1} from '@datadog/datadog-api-client';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {CategoryDetail} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {DatadogConverter} from './common';

export class ServiceLevelObjectives extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_ApplicationServiceLevelObjective',
    'sre_ServiceLevelObjective',
    'sre_ServiceLevelIndicator',
    'sre_SLOErrorBudget',
    'sre_ServiceLevelObjectiveTag',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const slo = record.record.data as v1.SearchServiceLevelObjectiveData;
    const attributes = slo.attributes;

    if (!attributes) {
      return [];
    }
    const records = [];

    const sloKey = {uid: slo.id, source};

    records.push({
      model: 'sre_ServiceLevelObjective',
      record: {
        ...sloKey,
        name: attributes.name,
        description: attributes.description,
        target: attributes.additionalProperties?.target_threshold,
        warningThreshold: attributes.additionalProperties?.warning_threshold,
        timeWindow: this.getTimeWindow(
          attributes.additionalProperties?.timeframe
        ),
        createdAt: this.unixSecondsToDate(attributes.createdAt),
        updatedAt: this.unixSecondsToDate(attributes.modifiedAt),
      },
    });

    if (attributes.status) {
      const status = attributes.status;
      records.push({
        model: 'sre_ServiceLevelIndicator',
        record: {
          // Using the timestamp of the indicator as the uid
          uid: String(status.indexedAt),
          measuredAt: this.unixSecondsToDate(status.indexedAt),
          value: status.sli,
          unit: 'Percentage',
          status: this.toStatus(status.state),
          slo: sloKey,
        },
      });

      records.push({
        model: 'sre_SLOErrorBudget',
        record: {
          uid: String(status.indexedAt),
          remainingPercentage: status.errorBudgetRemaining,
          remaining: status.rawErrorBudgetRemaining?.value,
          unit: status.rawErrorBudgetRemaining?.unit,
          measuredAt: this.unixSecondsToDate(status.indexedAt),
          slo: sloKey,
        },
      });
    }

    for (const tag of this.getTags(attributes.allTags)) {
      records.push({
        model: 'sre_ServiceLevelObjectiveTag',
        record: {slo: sloKey, tag: {uid: tag}},
      });
    }

    for (const application of this.getApplications(
      ctx,
      attributes.serviceTags
    )) {
      records.push({
        model: 'compute_ApplicationServiceLevelObjective',
        record: {slo: sloKey, application},
      });
    }

    return records;
  }

  private getTimeWindow(timeframe: string): {
    type: CategoryDetail;
    length: string;
  } {
    if (!timeframe) {
      return;
    }
    const type = ['7d', '30d', '90d'].includes(timeframe)
      ? {category: 'RollingPeriod', detail: timeframe}
      : {category: 'Custom', detail: timeframe};

    return {type, length: timeframe};
  }

  private toStatus(state: v1.SLOState): CategoryDetail {
    if (!state) {
      return;
    }
    switch (state) {
      case 'breached':
        return {category: 'Breached', detail: state};
      case 'warning':
        return {category: 'Warning', detail: state};
      case 'ok':
        return {category: 'Healthy', detail: state};
      case 'no_data':
        return {category: 'Pending', detail: state};
      default:
        // Handled for UnparsedObject in SLOState type
        return {category: 'Custom', detail: String(state._data)};
    }
  }

  /**
   * Service Level Objective timestamps are in Unix time (seconds).
   * Convert to milliseconds first before creating the Date object.
   * @param number - The Unix timestamp
   * @returns The Date object
   */
  private unixSecondsToDate(number?: number): Date | undefined {
    if (!number) {
      return;
    }
    return new Date(number * 1000);
  }
}
