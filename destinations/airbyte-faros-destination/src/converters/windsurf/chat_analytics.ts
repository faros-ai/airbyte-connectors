import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ChatAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class ChatAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as ChatAnalyticsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.date);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.sum_chat_loc_used > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.LinesAccepted,
          value: item.sum_chat_loc_used,
          organization: this.streamName.source,
          userEmail: item.email,
          model: item.model_id,
          feature: item.latest_intent_type ?? WindsurfFeature.Chat,
          editor: item.ide,
        })
      );

      // Add Usages metric for number of chats received
      if (item.sum_num_chats_received > 0) {
        res.push(
          ...this.getAssistantMetric({
            startedAt,
            endedAt,
            assistantMetricType: AssistantMetric.Usages,
            value: item.sum_num_chats_received,
            organization: this.streamName.source,
            userEmail: item.email,
            model: item.model_id,
            feature: item.latest_intent_type ?? WindsurfFeature.Chat,
            editor: item.ide,
          })
        );
      }

      // Add UserToolUsage record for active usage
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          userTool: {
            user: {uid: item.email, source: this.streamName.source},
            organization: {
              uid: this.streamName.source,
              source: this.streamName.source,
            },
            tool: {
              category: VCSToolCategory.CodingAssistant,
              detail: VCSToolDetail.Windsurf,
            },
          },
          usedAt: startedAt.toISOString(),
          recordedAt: startedAt.toISOString(),
        },
      });
    }

    return res;
  }
}
