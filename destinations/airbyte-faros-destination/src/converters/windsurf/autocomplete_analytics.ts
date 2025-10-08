import {AirbyteRecord} from 'faros-airbyte-cdk';
import {AutocompleteAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class AutocompleteAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as AutocompleteAnalyticsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.date);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.sum_num_acceptances > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.SuggestionsAccepted,
          value: item.sum_num_acceptances,
          organization: this.streamName.source,
          userEmail: item.email,
          feature: WindsurfFeature.Autocompletion,
          editor: item.ide,
          language: item.language,
        })
      );
    }

    if (item.sum_num_lines_accepted > 0) {
      res.push(
        ...this.getAssistantMetric({
          startedAt,
          endedAt,
          assistantMetricType: AssistantMetric.LinesAccepted,
          value: item.sum_num_lines_accepted,
          organization: this.streamName.source,
          userEmail: item.email,
          feature: WindsurfFeature.Autocompletion,
          editor: item.ide,
          language: item.language,
        })
      );
    }

    return res;
  }
}
