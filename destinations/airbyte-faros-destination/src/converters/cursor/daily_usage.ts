import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter} from './common';

const DailyUsageItemToAssistantMetricType: Partial<
  Record<keyof DailyUsageItem, AssistantMetric>
> = {
  acceptedLinesAdded: AssistantMetric.LinesAccepted,
  totalAccepts: AssistantMetric.SuggestionsAccepted,
  totalRejects: AssistantMetric.SuggestionsDiscarded,
};

enum Feature {
  Tab = 'Tab',
  Composer = 'Composer',
  Chat = 'Chat',
  Agent = 'Agent',
  CmdK = 'Cmd+K',
  BugBot = 'BugBot',
}

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
    const res: DestinationRecord[] = [];

    for (const [field, assistantMetricType] of Object.entries(
      DailyUsageItemToAssistantMetricType
    )) {
      const value = dailyUsageItem[field];
      if (isNil(value)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric(
          day,
          Utils.toDate(day.getTime() + DAY_MS),
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
          Utils.toDate(day.getTime() + DAY_MS),
          AssistantMetric.Custom,
          value,
          VCSToolDetail.Cursor,
          dailyUsageItem.email,
          field
        )
      );
    }

    for (const [field, feature] of Object.entries(DailyUsageItemToFeature)) {
      const value = dailyUsageItem[field];
      if (isNil(value)) {
        continue;
      }
      res.push(
        ...this.getAssistantMetric(
          day,
          Utils.toDate(day.getTime() + DAY_MS),
          AssistantMetric.Usages,
          value,
          VCSToolDetail.Cursor,
          dailyUsageItem.email,
          undefined,
          undefined,
          feature
        )
      );
    }
    return res;
  }
}
