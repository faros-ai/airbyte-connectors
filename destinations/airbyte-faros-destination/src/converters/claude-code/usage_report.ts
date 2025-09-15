import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UsageReportItem} from 'faros-airbyte-common/claude-code';
import {digest} from 'faros-airbyte-common/common';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {
  AssistantMetric,
  OrgKey,
  VCSToolCategory,
  VCSToolDetail,
} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClaudeCodeConverter, ClaudeCodeFeature} from './common';

export interface ClaudeCodeAssistantMetricConfig {
  startedAt: Date;
  endedAt: Date;
  assistantMetricType: AssistantMetric;
  value: number;
  organization: OrgKey;
  userEmail: string;
  customMetricName?: string;
  model?: string;
  feature?: ClaudeCodeFeature;
  terminal?: string;
}

export class UsageReport extends ClaudeCodeConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const usageItem = record.record.data as UsageReportItem;
    return `${usageItem.date}__${usageItem.organization_id}__${usageItem.actor?.email_address || 'unknown'}`;
  }

  protected getAssistantMetric(
    config: ClaudeCodeAssistantMetricConfig
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
      terminal,
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
                  VCSToolDetail.ClaudeCode,
                  assistantMetricType,
                  startedAt.toISOString(),
                  organization.uid,
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
          organization,
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

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usageItem = record.record.data as UsageReportItem;

    if (!usageItem.actor?.email_address) {
      return [];
    }

    const day = Utils.toDate(usageItem.date);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    const organization = {
      uid: usageItem.organization_id.toLowerCase(),
      source: this.streamName.source,
    };

    const res: DestinationRecord[] = [];

    // TODO: Add specific Claude Code metric conversions here
    // This is just the boilerplate structure - no records emitted yet
    // Example usage:
    // res.push(...this.getAssistantMetric({
    //   startedAt: day,
    //   endedAt: nextDay,
    //   assistantMetricType: AssistantMetric.LinesAccepted,
    //   value: usageItem.core_metrics.lines_of_code.added,
    //   organization,
    //   userEmail: usageItem.actor.email_address,
    //   feature: ClaudeCodeFeature.UsageGeneral,
    //   terminal: usageItem.terminal_type,
    // }));

    return res;
  }
}
