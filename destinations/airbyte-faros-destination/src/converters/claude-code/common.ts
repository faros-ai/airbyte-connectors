import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {Converter, DestinationRecord} from '../converter';

export enum ClaudeCodeFeature {
  EditTool = 'EditTool',
  MultiEditTool = 'MultiEditTool',
  NotebookEditTool = 'NotebookEditTool',
  WriteTool = 'WriteTool',
  UsageGeneral = 'UsageGeneral',
}

export abstract class ClaudeCodeConverter extends Converter {
  source = 'ClaudeCode';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.email || record?.record?.data?.id;
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
    terminal?: string
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
                  VCSToolDetail.ClaudeCode,
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
                  {key: 'terminal', value: terminal},
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
            detail: VCSToolDetail.ClaudeCode,
          },
          ...(model && {model}),
          ...(feature && {feature}),
          ...(terminal && {terminal}),
        },
      },
    ];
  }
}
