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

    if (item.num_acceptances > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.SuggestionsAccepted,
          item.num_acceptances,
          this.streamName.source,
          item.email,
          undefined,
          undefined,
          WindsurfFeature.Autocompletion,
          item.ide,
          item.language
        )
      );
    }

    if (item.num_lines_accepted > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.LinesAccepted,
          item.num_lines_accepted,
          this.streamName.source,
          item.email,
          undefined,
          undefined,
          WindsurfFeature.Autocompletion,
          item.ide,
          item.language
        )
      );
    }

    return res;
  }
}
