import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GroupsStream, ZendeskConverter} from './common';

export class SatisfactionRatings extends ZendeskConverter {
  private readonly definitionUid = 'zendesk-satisfaction-ratings';
  private createDefinition = true;

  override get dependencies(): ReadonlyArray<StreamName> {
    return [GroupsStream];
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
    'org_TeamMetric',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
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
          valueType: {category: 'String'},
          valueSource: {category: 'MetricValueEntries'},
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

    // Assign metric value to team
    const group = ctx.get(GroupsStream.asString, rating.group_id)?.record?.data;
    const orgTeam = this.orgTeam(ctx, group);
    if (orgTeam) {
      recs.push({
        model: 'org_TeamMetric',
        record: {
          team: {uid: orgTeam.uid},
          value: {...metricValueKey},
        },
      });
    }

    return recs;
  }
}
