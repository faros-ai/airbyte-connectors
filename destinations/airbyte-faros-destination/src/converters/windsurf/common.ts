import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {Converter, DestinationRecord} from '../converter';

export interface WindsurfConfig {
  // Add any windsurf-specific configuration here in the future
}

export enum WindsurfFeature {
  Autocompletion = 'Autocompletion',
  Cascade = 'Cascade',
}

export abstract class WindsurfConverter extends Converter {
  source = 'Windsurf';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.email;
  }

  protected getAssistantMetric(
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
