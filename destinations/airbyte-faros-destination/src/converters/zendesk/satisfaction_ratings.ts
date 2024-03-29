import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {ZendeskConverter} from './common';

export class SatisfactionRatings extends ZendeskConverter {
  private readonly definitionUid = 'zendesk-satisfaction-ratings';
  private createDefinition = true;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
    'org_TeamMetric',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const recs = [];
    const definitionKey = {uid: this.definitionUid};

    if (this.createDefinition) {
      // Initialize metric definition
      recs.push({
        model: 'faros_MetricDefinition',
        record: {
          ...definitionKey,
          name: 'Zendesk Satisfaction Ratings',
          valueType: 'String',
          valueSourceType: 'MetricValueEntries',
        },
      });
      this.createDefinition = false;
    }

    const rating = record.record.data;
    const metricValueKey = {
      uid: `zendesk-satisfaction-rating-${rating.id}`,
      definition: definitionKey,
    };

    recs.push({
      model: 'faros_MetricValue',
      record: {
        ...metricValueKey,
        value: rating.score,
        computedAt: Utils.toDate(rating.updated_at),
      },
    });
    recs.push({
      model: 'org_TeamMetric',
      record: {
        team: {uid: `zendesk-group-${rating.group_id}`},
        value: {...metricValueKey},
      },
    });

    return recs;
  }
}
