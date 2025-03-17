import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {DestinationModel, DestinationRecord} from '../converter';
import {DatadogConverter} from './common';

export class Metrics extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
  ];

  readonly metricDefinitions = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res = [];
    const metric = record.record.data;

    const metricDefinition = {
      model: 'faros_MetricDefinition',
      record: {
        uid: `${metric.queryHash}-${metric.metric}`,
        name: metric.metric,
        description: metric.displayName,
        valueType: this.metricValueType(metric.primaryUnit),
      },
    };
    if (!this.metricDefinitions.has(metricDefinition.record.uid)) {
      res.push(metricDefinition);
      this.metricDefinitions.add(metricDefinition.record.uid);
    }

    const metricValue = {
      model: 'faros_MetricValue',
      record: {
        uid: metric.id,
        value: metric.value,
        computedAt: Utils.toDate(metric.timestamp),
        definition: {uid: metricDefinition.record.uid},
      },
    };
    res.push(metricValue);

    return res;
  }

  metricValueType(unit: Dictionary<any>): {category: string; detail: string} {
    if (!unit?.family) return {category: 'Custom', detail: 'unknown'};
    const detail = toLower(unit.family);

    // For more details see - https://docs.datadoghq.com/metrics/units/
    switch (detail) {
      case 'percentage':
        return {category: 'Percentage', detail};
      case 'time':
        return {category: 'Timestamp', detail};
      case 'bytes':
      case 'network':
        return {category: 'Numeric', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
