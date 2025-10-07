import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CascadeRunsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class CascadeRunsAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
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
