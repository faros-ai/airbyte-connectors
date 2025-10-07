import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {PCWAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter} from './common';

export class PcwAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as PCWAnalyticsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.date);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.percent_code_written !== undefined) {
      res.push({
        model: 'vcs_AssistantMetric',
        record: {
          uid: digest(
            [
              VCSToolDetail.Windsurf,
              AssistantMetric.PercentageOfCodeWritten,
              startedAt.toISOString(),
              this.streamName.source,
            ].join('__')
          ),
          source: this.source,
          startedAt,
          endedAt,
          type: {
            category: AssistantMetric.PercentageOfCodeWritten,
          },
          valueType: 'Percent',
          value: String(item.percent_code_written),
          organization: {
            uid: this.streamName.source,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Windsurf,
          },
        },
      });
    }

    return res;
  }
}
