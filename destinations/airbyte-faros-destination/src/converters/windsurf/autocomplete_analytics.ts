import {AirbyteRecord} from 'faros-airbyte-cdk';
import {AutocompleteAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {WindsurfConverter} from './common';

export class AutocompleteAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const item = record.record.data as AutocompleteAnalyticsItem;
    return `${item.api_key}__${item.date}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as AutocompleteAnalyticsItem;

    // Skip records without email mapping
    if (!item.email) {
      ctx.logger.warn(`No email mapping found for api_key: ${item.api_key}`);
      return [];
    }

    const res: DestinationRecord[] = [];

    // Parse date to create daily timestamp range
    const dateStr = `${item.date}T00:00:00Z`;
    const timestamp = Utils.toDate(dateStr);
    const endTimestamp = new Date(timestamp);
    endTimestamp.setDate(endTimestamp.getDate() + 1);

    // Track suggestions accepted
    if (item.num_acceptances !== undefined && item.num_acceptances > 0) {
      res.push(
        ...this.getAssistantMetric(
          timestamp,
          endTimestamp,
          AssistantMetric.SuggestionsAccepted,
          item.num_acceptances,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          item.ide
        )
      );
    }

    // Track lines accepted
    if (item.num_lines_accepted !== undefined && item.num_lines_accepted > 0) {
      res.push(
        ...this.getAssistantMetric(
          timestamp,
          endTimestamp,
          AssistantMetric.LinesAccepted,
          item.num_lines_accepted,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          item.ide
        )
      );
    }

    // Track usage by language as custom metric
    if (item.language && item.num_acceptances > 0) {
      res.push(
        ...this.getAssistantMetric(
          timestamp,
          endTimestamp,
          AssistantMetric.Custom,
          item.num_acceptances,
          VCSToolDetail.Windsurf,
          item.email,
          `acceptances_${item.language.toLowerCase()}`,
          undefined,
          item.ide
        )
      );
    }

    return res;
  }

  private getAssistantMetric(
    startedAt: Date,
    endedAt: Date,
    assistantMetricType: AssistantMetric,
    value: number,
    org: string,
    userEmail: string,
    customMetricName?: string,
    model?: string,
    feature?: string
  ): DestinationRecord[] {
    const digest = require('faros-airbyte-common/common').digest;

    return [
      {
        model: 'vcs_AssistantMetric',
        record: {
          uid: digest(
            [
              VCSToolDetail.Windsurf,
              assistantMetricType,
              startedAt.toISOString(),
              org,
              userEmail,
              customMetricName,
              model,
              feature,
            ]
              .filter((v) => v !== undefined)
              .join('__')
          ),
          source: this.source,
          startedAt,
          endedAt,
          type: {
            category: assistantMetricType,
            ...(customMetricName && {detail: customMetricName}),
          },
          valueType: 'Int',
          value: String(value),
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Windsurf,
          },
          ...(model && {model}),
          ...(feature && {feature}),
        },
      },
    ];
  }
}
