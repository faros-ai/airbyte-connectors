import {AirbyteRecord} from 'faros-airbyte-cdk';
import {digest} from 'faros-airbyte-common/common';
import {DailyUsageItem} from 'faros-airbyte-common/cursor';
import {isNil} from 'lodash';

import {VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {Converter, DestinationRecord, StreamContext} from '../converter';

export interface CursorConfig {
  custom_metrics?: ReadonlyArray<keyof DailyUsageItem>;
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
    startedAt: Date,
    endedAt: Date,
    assistantMetricType: string,
    value: number | string | boolean,
    org: string,
    userEmail: string,
    customMetricName?: keyof DailyUsageItem,
    model?: string,
    feature?: string
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
                  VCSToolDetail.Cursor,
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
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
          ...(model && {model}),
          ...(feature && {feature}),
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
