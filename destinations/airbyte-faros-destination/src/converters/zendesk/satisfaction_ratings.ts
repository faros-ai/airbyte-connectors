import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ZendeskConverter} from './common';

export class SatisfactionRatings extends ZendeskConverter {
  private readonly definitionUid = 'zendesk-satisfaction-ratings';
  private createDefinition = true;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
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
    const ratingId = rating.id;

    recs.push({
      model: 'faros_MetricValue',
      record: {
        uid: 'zendesk-satisfaction-rating-' + ratingId,
        value: rating.score,
        computedAt: Utils.toDate(rating.updated_at),
        definition: definitionKey,
      },
    });

    return recs;
  }
}
