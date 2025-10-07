import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ChatAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class ChatAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as ChatAnalyticsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.date);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.chat_loc_used > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.LinesAccepted,
          item.chat_loc_used,
          this.streamName.source,
          item.email,
          undefined,
          undefined,
          WindsurfFeature.Chat,
          item.ide,
          item.language
        )
      );
    }

    return res;
  }
}
