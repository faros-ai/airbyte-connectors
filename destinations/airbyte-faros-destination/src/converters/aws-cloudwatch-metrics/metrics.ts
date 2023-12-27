import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {VError} from 'verror';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';

export interface MetricsConfig {
  tag_uid?: string;
  tag_key?: string;
  tag_value?: string;
}

export class Metrics extends Converter {
  source = 'aws-cloudwatch-metrics';

  private config: MetricsConfig;
  private readonly metricDefinitions = new Set<string>();
  private readonly tags = new Set<string>();

  id(record: AirbyteRecord): string {
    if (!record.record.data['queryName']) {
      throw new VError('queryName is required');
    }

    if (!record.record.data['timestamp']) {
      throw new VError('timestamp is required');
    }

    const prefix = this.config.tag_uid ? `${this.config.tag_uid}-` : '';
    return `${prefix}${record.record.data['queryName']}-${record.record.data['timestamp']}`;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
    'faros_Tag',
    'faros_MetricValueTag',
  ];

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.config =
      this.config ??
      ctx?.config.source_specific_configs?.aws_cloudwatch_metrics ??
      {};

    const res: DestinationRecord[] = [];
    const metric = record.record.data;

    const metricDefinition = {
      model: 'faros_MetricDefinition',
      record: {
        uid: metric.queryName,
        name: metric.queryName,
        description: metric.queryName,
        valueType: {
          category: 'Numeric',
          detail: '',
        },
      },
    };

    if (!this.metricDefinitions.has(metricDefinition.record.uid)) {
      res.push(metricDefinition);
      this.metricDefinitions.add(metricDefinition.record.uid);
    }

    if (this.config.tag_uid) {
      const tagUid = this.config.tag_uid;
      if (!this.tags.has(tagUid)) {
        res.push({
          model: 'faros_Tag',
          record: {
            uid: tagUid,
            key: this.config.tag_key ?? null,
            value: this.config.tag_value ?? null,
          },
        });
        this.tags.add(tagUid);
      }

      res.push({
        model: 'faros_MetricValueTag',
        record: {
          tag: {uid: tagUid},
          value: {
            uid: this.id(record),
            definition: {uid: metricDefinition.record.uid},
          },
        },
      });
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

    return res;
  }
}
