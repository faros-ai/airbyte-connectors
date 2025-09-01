import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {AutocompleteAnalyticsItem} from 'faros-airbyte-common/windsurf';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {WindsurfConverter} from './common';

export class AutocompleteAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const item = record.record.data as AutocompleteAnalyticsItem;
    return `${item.email}__${item.date}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const item = record.record.data as AutocompleteAnalyticsItem;

    const res: DestinationRecord[] = [];

    const startedAt = Utils.toDate(item.date);
    const endedAt = Utils.toDate(startedAt.getTime() + 24 * 60 * 60 * 1000);

    if (item.num_acceptances !== undefined && item.num_acceptances > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.SuggestionsAccepted,
          item.num_acceptances,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          undefined,
          item.ide,
          item.language
        )
      );
    }

    if (item.num_lines_accepted !== undefined && item.num_lines_accepted > 0) {
      res.push(
        ...this.getAssistantMetric(
          startedAt,
          endedAt,
          AssistantMetric.LinesAccepted,
          item.num_lines_accepted,
          VCSToolDetail.Windsurf,
          item.email,
          undefined,
          undefined,
          undefined,
          item.ide,
          item.language
        )
      );
    }

    return res;
  }

  private getAssistantMetric(
    startedAt: Date,
    endedAt: Date,
    assistantMetricType: AssistantMetric,
    value: number,
    org: string,
    userEmail: string,
    customMetricName?: string,
    model?: string,
    feature?: string,
    editor?: string,
    language?: string
  ): DestinationRecord[] {
    return [
      {
        model: 'vcs_AssistantMetric',
        record: {
          uid: digest(
            []
              .concat(
                // original fields (required) to be included in the digest
                ...[
                  VCSToolDetail.Windsurf,
                  assistantMetricType,
                  startedAt.toISOString(),
                  org,
                  userEmail,
                  customMetricName,
                ],
                // newer fields (optional) to be included in the digest
                ...[
                  {key: 'model', value: model},
                  {key: 'feature', value: feature},
                  {key: 'editor', value: editor},
                  {key: 'language', value: language},
                ]
                  .filter((v) => !isNil(v.value))
                  .map((v) => `${v.key}:${v.value}`)
              )
              .join('__')
          ),
          source: this.source,
          startedAt,
          endedAt,
          type: {
            category: assistantMetricType,
            ...(customMetricName && {detail: customMetricName}),
          },
          valueType: 'Int',
          value: String(value),
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Windsurf,
          },
          ...(model && {model}),
          ...(feature && {feature}),
          ...(editor && {editor}),
        },
      },
    ];
  }
}
