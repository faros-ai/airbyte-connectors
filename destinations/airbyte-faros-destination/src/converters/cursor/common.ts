import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {isNil} from 'lodash';

import {OrgKey, RepoKey, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {Converter, DestinationRecord, StreamContext} from '../converter';

export interface CursorConfig {
  custom_metrics?: ReadonlyArray<keyof DailyUsageItem>;
}

export interface AssistantMetricConfig {
  startedAt: Date;
  endedAt: Date;
  assistantMetricType: string;
  value: number | string | boolean;
  organization: OrgKey;
  userEmail: string;
  customMetricName?: keyof DailyUsageItem;
  model?: string;
  feature?: string;
  repository?: RepoKey;
  startedAtForUid?: Date;
}

export enum Feature {
  Tab = 'Tab',
  Composer = 'Composer',
  Chat = 'Chat',
  Agent = 'Agent',
  CmdK = 'Cmd+K',
  BugBot = 'BugBot',
}

export abstract class CursorConverter extends Converter {
  source = 'Cursor';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected cursorConfig(ctx: StreamContext): CursorConfig {
    return ctx?.config?.source_specific_configs?.cursor ?? {};
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
      repository,
      startedAtForUid,
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
                  VCSToolDetail.Cursor,
                  assistantMetricType,
                  (startedAtForUid || startedAt).toISOString(),
                  organization.uid,
                  userEmail,
                  customMetricName,
                ],
                // newer fields (optional) to be included in the digest
                ...[
                  {key: 'model', value: model},
                  {key: 'feature', value: feature},
                  {key: 'repository', value: repository?.uid},
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
          valueType: getValueType(value),
          value: String(value),
          organization,
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
          ...(model && {model}),
          ...(feature && {feature}),
          ...(repository && {repository}),
        },
      },
    ];
  }
}

function getValueType(value: number | string | boolean): string {
  switch (typeof value) {
    case 'number':
      return 'Int';
    case 'boolean':
      return 'Bool';
    default:
      return 'String';
  }
}
