import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CascadeLinesItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class CascadeLinesAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as CascadeLinesItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.day);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.linesAccepted > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.LinesAccepted,
          value: item.linesAccepted,
          organization: this.streamName.source,
          userEmail: item.email,
          feature: WindsurfFeature.Cascade,
        })
      );
    }

    // Calculate lines discarded = lines suggested - lines accepted
    if (item.linesSuggested > item.linesAccepted) {
      const linesDiscarded = item.linesSuggested - item.linesAccepted;
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.LinesDiscarded,
          value: linesDiscarded,
          organization: this.streamName.source,
          userEmail: item.email,
          feature: WindsurfFeature.Cascade,
        })
      );
    }

    // Add UserToolUsage record for active usage
    if (item.linesAccepted > 0 || item.linesSuggested > 0) {
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
