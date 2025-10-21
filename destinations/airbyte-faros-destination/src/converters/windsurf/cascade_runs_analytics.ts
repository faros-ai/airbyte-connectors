import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CascadeRunsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class CascadeRunsAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as CascadeRunsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.day);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    // Generate Usage metric for messagesSent
    if (item.messagesSent && item.messagesSent > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.Usages,
          value: item.messagesSent,
          organization: this.streamName.source,
          userEmail: item.email,
          model: item.model,
          feature: item.mode,
        })
      );

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

    // Generate Cost metric for promptsUsed
    if (item.promptsUsed && item.promptsUsed > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.Cost,
          value: item.promptsUsed,
          organization: this.streamName.source,
          userEmail: item.email,
          model: item.model,
          feature: item.mode,
        })
      );
    }

    return res;
  }
}
