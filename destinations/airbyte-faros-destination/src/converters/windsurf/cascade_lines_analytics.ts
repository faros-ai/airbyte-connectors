import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CascadeLinesItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter, WindsurfFeature} from './common';

export class CascadeLinesAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const item = record.record.data as CascadeLinesItem;
    return `${item.email}__${item.day}`;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as CascadeLinesItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.day);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.linesAccepted !== undefined && item.linesAccepted > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.LinesAccepted,
          item.linesAccepted,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          WindsurfFeature.Cascade
        )
      );
    }

    // Calculate lines discarded = lines suggested - lines accepted
    if (
      item.linesSuggested !== undefined &&
      item.linesAccepted !== undefined &&
      item.linesSuggested > item.linesAccepted
    ) {
      const linesDiscarded = item.linesSuggested - item.linesAccepted;
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.LinesDiscarded,
          linesDiscarded,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          WindsurfFeature.Cascade
        )
      );
    }

    return res;
  }
}
