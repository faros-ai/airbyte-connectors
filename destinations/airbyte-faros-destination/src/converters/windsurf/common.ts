import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {Converter, DestinationRecord} from '../converter';

export enum WindsurfFeature {
  Autocompletion = 'Autocompletion',
  Cascade = 'Cascade',
  Chat = 'Chat',
}

export interface AssistantMetricConfig {
  startedAt: Date;
  endedAt: Date;
  assistantMetricType: AssistantMetric;
  value: number;
  organization: string;
  userEmail?: string;
  customMetricName?: string;
  model?: string;
  feature?: string;
  editor?: string;
  language?: string;
  valueType?: 'Int' | 'Percent';
}

export abstract class WindsurfConverter extends Converter {
  source = 'Windsurf';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected getAssistantMetric(
    config: AssistantMetricConfig
  ): DestinationRecord[] {
    const {
      startedAt,
      endedAt,
      assistantMetricType,
      value,
      organization,
      userEmail,
      customMetricName,
      model,
      feature,
      editor,
      language,
      valueType = 'Int',
    } = config;
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
                  organization,
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
          valueType,
          value: String(value),
          organization: {
            uid: organization,
            source: this.streamName.source,
          },
          ...(userEmail && {
            user: {uid: userEmail, source: this.streamName.source},
          }),
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
