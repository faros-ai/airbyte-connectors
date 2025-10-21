import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {DateTime} from 'luxon';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {CursorConverter} from './common';

interface DailyMetric {
  day: Date;
  userEmail: string;
  model: string;
  usageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCents: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class UsageEvents extends CursorConverter {
  private readonly dailyMetrics: Map<string, DailyMetric> = new Map();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  id(record: AirbyteRecord): string {
    const usageEventItem = record.record.data as UsageEventItem;
    return `${usageEventItem.timestamp}__${usageEventItem.userEmail}`;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usageEventItem = record.record.data as UsageEventItem;

    if (!usageEventItem.userEmail) {
      return [];
    }

    const timestamp = Utils.toDate(Number(usageEventItem.timestamp));
    const day = DateTime.fromJSDate(timestamp, {zone: 'utc'})
      .startOf('day')
      .toJSDate();

    // Create aggregation key
    const key = `${day.toISOString()}_${usageEventItem.userEmail}_${usageEventItem.model}`;

    // Aggregate metrics
    const existing = this.dailyMetrics.get(key);
    if (existing) {
      existing.usageCount++;
      if (usageEventItem.tokenUsage) {
        existing.inputTokens += usageEventItem.tokenUsage.inputTokens || 0;
        existing.outputTokens += usageEventItem.tokenUsage.outputTokens || 0;
        existing.cacheReadTokens +=
          usageEventItem.tokenUsage.cacheReadTokens || 0;
        existing.cacheWriteTokens +=
          usageEventItem.tokenUsage.cacheWriteTokens || 0;
        existing.totalCents += usageEventItem.tokenUsage.totalCents || 0;
      }
    } else {
      this.dailyMetrics.set(key, {
        day,
        userEmail: usageEventItem.userEmail,
        model: usageEventItem.model,
        usageCount: 1,
        inputTokens: usageEventItem.tokenUsage?.inputTokens || 0,
        outputTokens: usageEventItem.tokenUsage?.outputTokens || 0,
        cacheReadTokens: usageEventItem.tokenUsage?.cacheReadTokens || 0,
        cacheWriteTokens: usageEventItem.tokenUsage?.cacheWriteTokens || 0,
        totalCents: usageEventItem.tokenUsage?.totalCents || 0,
      });
    }

    // Still emit UserToolUsage immediately (not aggregated)
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_UserToolUsage',
      record: {
        userTool: {
          user: {uid: usageEventItem.userEmail, source: this.streamName.source},
          organization: {
            uid: this.streamName.source,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
        },
        usedAt: timestamp.toISOString(),
        recordedAt: timestamp.toISOString(),
      },
    });

    return res;
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const organization = {
      uid: this.streamName.source,
      source: this.streamName.source,
    };

    for (const metric of this.dailyMetrics.values()) {
      const startedAt = metric.day;
      const endedAt = Utils.toDate(metric.day.getTime() + DAY_MS);

      // Emit Usages metric with aggregated count
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.Usages,
          value: metric.usageCount,
          organization,
          userEmail: metric.userEmail,
          model: metric.model,
        })
      );

      // Emit token metrics if > 0
      if (metric.inputTokens > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.InputTokens,
            value: metric.inputTokens,
            organization,
            userEmail: metric.userEmail,
            model: metric.model,
          })
        );
      }

      if (metric.outputTokens > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.OutputTokens,
            value: metric.outputTokens,
            organization,
            userEmail: metric.userEmail,
            model: metric.model,
          })
        );
      }

      if (metric.cacheReadTokens > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.CacheReadTokens,
            value: metric.cacheReadTokens,
            organization,
            userEmail: metric.userEmail,
            model: metric.model,
          })
        );
      }

      if (metric.cacheWriteTokens > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.CacheWriteTokens,
            value: metric.cacheWriteTokens,
            organization,
            userEmail: metric.userEmail,
            model: metric.model,
          })
        );
      }

      if (metric.totalCents > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.Cost,
            value: Math.round(metric.totalCents),
            organization,
            userEmail: metric.userEmail,
            model: metric.model,
          })
        );
      }
    }

    return res;
  }
}
