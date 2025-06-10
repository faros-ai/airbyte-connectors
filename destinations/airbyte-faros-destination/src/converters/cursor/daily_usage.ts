import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter} from './common';

const DailyUsageFieldToAssistantMetricType: Partial<
  Record<keyof DailyUsageItem, AssistantMetric>
> = {
  acceptedLinesAdded: AssistantMetric.LinesAccepted,
  totalAccepts: AssistantMetric.SuggestionsAccepted,
  totalRejects: AssistantMetric.SuggestionsDiscarded,
};

const DEFAULT_CUSTOM_METRICS: (keyof DailyUsageItem)[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

export class DailyUsage extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const dailyUsageItem = record.record.data as DailyUsageItem;

    if (!dailyUsageItem.email || !dailyUsageItem.isActive) {
      return [];
    }

    const day = Utils.toDate(dailyUsageItem.date);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_UserToolUsage',
      record: {
        user: {uid: dailyUsageItem.email, source: this.streamName.source},
        organization: {
          uid: VCSToolDetail.Cursor,
          source: this.streamName.source,
        },
        tool: {
          category: VCSToolCategory.CodingAssistant,
          detail: VCSToolDetail.Cursor,
        },
        usedAt: day.toISOString(),
        recordedAt: day.toISOString(),
      },
    });

    for (const [field, assistantMetricType] of Object.entries(
      DailyUsageFieldToAssistantMetricType
    )) {
      const value = dailyUsageItem[field];
      if (isNil(value)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric(
          day,
          assistantMetricType,
          value,
          VCSToolDetail.Cursor,
          dailyUsageItem.email
        )
      );
    }

    // Get custom metrics from config, fallback to default if not configured
    const config = this.cursorConfig(ctx);
    const customMetrics = config.custom_metrics ?? DEFAULT_CUSTOM_METRICS;

    for (const field of customMetrics) {
      const value = dailyUsageItem[field];
      if (isNil(value)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric(
          day,
          AssistantMetric.Custom,
          value,
          VCSToolDetail.Cursor,
          dailyUsageItem.email,
          field
        )
      );
    }

    return res;
  }

  private getAssistantMetric(
    day: Date,
    assistantMetricType: string,
    value: number | string | boolean,
    org: string,
    userEmail: string,
    customMetricName?: string
  ): DestinationRecord[] {
    return [
      {
        model: 'vcs_AssistantMetric',
        record: {
          uid: digest(
            [
              VCSToolDetail.Cursor,
              assistantMetricType,
              day.toISOString(),
              org,
              userEmail,
              customMetricName,
            ].join('__')
          ),
          source: this.source,
          startedAt: day,
          endedAt: Utils.toDate(day.getTime() + DAY_MS),
          type: {
            category: assistantMetricType,
            ...(customMetricName && {detail: customMetricName}),
          },
          valueType: getValueType(value),
          value: String(value),
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
        },
      },
    ];
  }
}

function getValueType(value: number | string | boolean): string {
  switch (typeof value) {
    case 'number':
      return 'Int';
    case 'boolean':
      return 'Bool';
    default:
      return 'String';
  }
}
