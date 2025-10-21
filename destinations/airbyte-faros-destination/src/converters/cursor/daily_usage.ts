import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter, Feature} from './common';

const DailyUsageItemToAssistantMetricType: Partial<
  Record<keyof DailyUsageItem, AssistantMetric>
> = {
  acceptedLinesAdded: AssistantMetric.LinesAccepted,
  totalAccepts: AssistantMetric.SuggestionsAccepted,
  totalRejects: AssistantMetric.SuggestionsDiscarded,
};

const DailyUsageItemToFeature: Partial<Record<keyof DailyUsageItem, Feature>> =
  {
    totalTabsAccepted: Feature.Tab,
    composerRequests: Feature.Composer,
    chatRequests: Feature.Chat,
    agentRequests: Feature.Agent,
    cmdkUsages: Feature.CmdK,
    bugbotUsages: Feature.BugBot,
  };

const DEFAULT_CUSTOM_METRICS: (keyof DailyUsageItem)[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

export class DailyUsage extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const dailyUsageItem = record.record.data as DailyUsageItem;
    return `${dailyUsageItem.date}__${dailyUsageItem.email}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const dailyUsageItem = record.record.data as DailyUsageItem;

    if (!dailyUsageItem.email || !dailyUsageItem.isActive) {
      return [];
    }

    const day = Utils.toDate(dailyUsageItem.date);

    const organization = {
      uid: this.streamName.source,
      source: this.streamName.source,
    };

    const res: DestinationRecord[] = [];

    for (const [field, assistantMetricType] of Object.entries(
      DailyUsageItemToAssistantMetricType
    )) {
      const value = dailyUsageItem[field];
      if (isNil(value) || (typeof value === 'number' && value <= 0)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: Utils.toDate(day.getTime() + DAY_MS),
          assistantMetricType,
          value,
          organization,
          userEmail: dailyUsageItem.email,
        })
      );
    }

    // Get custom metrics from config, fallback to default if not configured
    const config = this.cursorConfig(ctx);
    const customMetrics = config.custom_metrics ?? DEFAULT_CUSTOM_METRICS;

    for (const field of customMetrics) {
      const value = dailyUsageItem[field];
      if (isNil(value) || (typeof value === 'number' && value <= 0)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: Utils.toDate(day.getTime() + DAY_MS),
          assistantMetricType: AssistantMetric.Custom,
          value,
          organization,
          userEmail: dailyUsageItem.email,
          customMetricName: field,
        })
      );
    }

    for (const [field, feature] of Object.entries(DailyUsageItemToFeature)) {
      const value = dailyUsageItem[field];
      if (isNil(value) || (typeof value === 'number' && value <= 0)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: Utils.toDate(day.getTime() + DAY_MS),
          assistantMetricType: AssistantMetric.Usages,
          value,
          organization,
          userEmail: dailyUsageItem.email,
          feature,
        })
      );
    }
    return res;
  }
}
