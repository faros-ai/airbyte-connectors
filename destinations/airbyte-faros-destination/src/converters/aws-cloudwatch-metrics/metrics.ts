import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {VError} from 'verror';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class Metrics extends Converter {
  source = 'aws-cloudwatch-metrics';

  id(record: AirbyteRecord): string {
    if (!record.record.data['queryName']) {
      throw new VError('queryName is required');
    }

    if (!record.record.data['timestamp']) {
      throw new VError('timestamp is required');
    }

    return `${record.record.data['queryName']}-${record.record.data['timestamp']}`;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
  ];

  private readonly metricDefinitions = new Set<string>();

  convert(record: AirbyteRecord): Promise<ReadonlyArray<DestinationRecord>> {
    const res = [];
    const metric = record.record.data;

    const metricDefinition = {
      model: 'faros_MetricDefinition',
      record: {
        uid: metric.queryName,
        name: metric.queryName,
        description: metric.queryName,
        valueType: 'Numeric',
      },
    };
    if (!this.metricDefinitions.has(metricDefinition.record.uid)) {
      res.push(metricDefinition);
      this.metricDefinitions.add(metricDefinition.record.uid);
    }

    const metricValue = {
      model: 'faros_MetricValue',
      record: {
        uid: this.id(record),
        value: `${metric.value}`,
        computedAt: Utils.toDate(metric.timestamp),
        definition: {uid: metricDefinition.record.uid},
      },
    };
    res.push(metricValue);

    return Promise.resolve(res);
  }
}
