import {v1} from '@datadog/datadog-api-client';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {CategoryDetail} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {DatadogConverter} from './common';

export class ServiceLevelObjectives extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sre_ServiceLevelObjective',
    'sre_ServiceLevelIndicator',
    'sre_ErrorBudget',
  ];

  async convert(
    record: AirbyteRecord
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
        createdAt: this.toDate(attributes.createdAt),
        updatedAt: this.toDate(attributes.modifiedAt),
      },
    });

    if (attributes.status) {
      const status = attributes.status;
      records.push({
        model: 'sre_ServiceLevelIndicator',
        record: {
          // Using the timestamp of the indicator as the uid
          uid: String(status.indexedAt),
          measuredAt: this.toDate(status.indexedAt),
          value: status.sli,
          unit: 'Percentage',
          status: this.toStatus(status.state),
          slo: sloKey,
        },
      });

      records.push({
        model: 'sre_ErrorBudget',
        record: {
          uid: String(status.indexedAt),
          remainingPercentage: status.errorBudgetRemaining,
          remaining: status.rawErrorBudgetRemaining
            ? {
                value: status.rawErrorBudgetRemaining.value,
                unit: status.rawErrorBudgetRemaining.unit,
              }
            : null,
          measuredAt: this.toDate(status.indexedAt),
          slo: sloKey,
        },
      });

      for (const sloTag of attributes.allTags ?? []) {
        // Tags are in the format of key:value or key
        // For tags with multiple colons, everything after the first colon is considered the value
        const colonIndex = sloTag.indexOf(':');
        const [key, value] =
          colonIndex === -1
            ? [sloTag, null]
            : [
                sloTag.substring(0, colonIndex),
                sloTag.substring(colonIndex + 1),
              ];
        const tag = {
          uid: value ? `${key}:${value}` : key,
          key,
          value,
        };

        records.push({
          model: 'sre_ServiceLevelObjectiveTag',
          record: {slo: sloKey, tag},
        });
      }
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
   * Service Level Objective timestamps are in Unix time (seconds). Convert to milliseconds.
   * @param number - The Unix timestamp
   * @returns The Date object
   */
  private toDate(number?: number): Date | undefined {
    if (!number) {
      return;
    }
    return new Date(number * 1000);
  }
}
