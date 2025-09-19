import {AirbyteRecord} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserUsage} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, OrgKey, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

interface AssistantMetricConfig {
  startedAt: Date;
  endedAt: Date;
  assistantMetricType: AssistantMetric;
  value: number | boolean;
  organization: OrgKey;
  userUid: string;
  editor?: string;
  feature?: string;
  language?: string;
  model?: string;
}

type MetricsData =
  | EnterpriseCopilotUserUsage
  | NonNullable<EnterpriseCopilotUserUsage['totals_by_ide']>[number]
  | NonNullable<EnterpriseCopilotUserUsage['totals_by_feature']>[number]
  | NonNullable<
      EnterpriseCopilotUserUsage['totals_by_language_feature']
    >[number]
  | NonNullable<EnterpriseCopilotUserUsage['totals_by_language_model']>[number]
  | NonNullable<EnterpriseCopilotUserUsage['totals_by_model_feature']>[number];

interface ProcessMetricsConfig {
  res: DestinationRecord[];
  data: MetricsData;
  day: Date;
  organization: OrgKey;
  userUid: string;
  editor?: string;
  feature?: string;
  language?: string;
  model?: string;
}

export class FarosEnterpriseCopilotUserUsage extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord,
    _ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const data = record.record.data as EnterpriseCopilotUserUsage;

    if (!data.user_login || !data.enterprise) {
      return [];
    }

    const day = Utils.toDate(data.day);
    const organization = {
      uid: GitHubCommon.enterpriseUid(data.enterprise),
      source: this.streamName.source,
    };
    const userUid = data.user_login;

    // Process core metrics
    this.processMetrics({res, data, day, organization, userUid});

    // Process engagement flags
    this.processEngagementFlags(res, data, day, organization, userUid);

    // Process IDE breakdown
    for (const ideBreakdown of data.totals_by_ide || []) {
      this.processMetrics({
        res,
        data: ideBreakdown,
        day,
        organization,
        userUid,
        editor: ideBreakdown.ide,
      });
    }

    // Process feature breakdown
    for (const featureBreakdown of data.totals_by_feature || []) {
      this.processMetrics({
        res,
        data: featureBreakdown,
        day,
        organization,
        userUid,
        feature: featureBreakdown.feature,
      });
    }

    // Process language+feature breakdown
    for (const item of data.totals_by_language_feature || []) {
      this.processMetrics({
        res,
        data: item,
        day,
        organization,
        userUid,
        feature: item.feature,
        language: item.language,
      });
    }

    // Process language+model breakdown
    for (const item of data.totals_by_language_model || []) {
      this.processMetrics({
        res,
        data: item,
        day,
        organization,
        userUid,
        language: item.language,
        model: item.model,
      });
    }

    // Process model+feature breakdown
    for (const item of data.totals_by_model_feature || []) {
      this.processMetrics({
        res,
        data: item,
        day,
        organization,
        userUid,
        feature: item.feature,
        model: item.model,
      });
    }

    return res;
  }

  private processMetrics(config: ProcessMetricsConfig): void {
    const {
      res,
      data,
      day,
      organization,
      userUid,
      editor,
      feature,
      language,
      model,
    } = config;
    const endedAt = Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000);

    // AILinesAdded
    if (data.loc_added_sum) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.AILinesAdded,
          value: data.loc_added_sum,
          organization,
          userUid,
          editor,
          feature,
          language,
          model,
        })
      );
    }

    // AILinesRemoved
    if (data.loc_deleted_sum) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.AILinesRemoved,
          value: data.loc_deleted_sum,
          organization,
          userUid,
          editor,
          feature,
          language,
          model,
        })
      );
    }

    // SuggestionsAccepted
    if (data.code_acceptance_activity_count) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.SuggestionsAccepted,
          value: data.code_acceptance_activity_count,
          organization,
          userUid,
          editor,
          feature,
          language,
          model,
        })
      );
    }

    // SuggestionsDiscarded (calculated)
    if (
      data.code_generation_activity_count &&
      data.code_acceptance_activity_count
    ) {
      const discarded =
        data.code_generation_activity_count -
        data.code_acceptance_activity_count;
      if (discarded > 0) {
        res.push(
          this.getAssistantMetric({
            startedAt: day,
            endedAt,
            assistantMetricType: AssistantMetric.SuggestionsDiscarded,
            value: discarded,
            organization,
            userUid,
            editor,
            feature,
            language,
            model,
          })
        );
      }
    }

    // Usages (only available in some breakdown types)
    if (
      'user_initiated_interaction_count' in data &&
      data.user_initiated_interaction_count
    ) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.Usages,
          value: data.user_initiated_interaction_count,
          organization,
          userUid,
          editor,
          feature,
          language,
          model,
        })
      );
    }
  }

  private processEngagementFlags(
    res: DestinationRecord[],
    data: EnterpriseCopilotUserUsage,
    day: Date,
    organization: OrgKey,
    userUid: string
  ): void {
    const endedAt = Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000);

    if (data.used_agent) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.Engagement,
          value: true,
          organization,
          userUid,
          feature: 'Agent',
        })
      );
    }

    if (data.used_chat) {
      res.push(
        this.getAssistantMetric({
          startedAt: day,
          endedAt,
          assistantMetricType: AssistantMetric.Engagement,
          value: true,
          organization,
          userUid,
          feature: 'Chat',
        })
      );
    }
  }

  private getAssistantMetric(config: AssistantMetricConfig): DestinationRecord {
    const {
      startedAt,
      endedAt,
      assistantMetricType,
      value,
      organization,
      userUid,
      editor,
      feature,
      language,
      model,
    } = config;

    const isBoolean = typeof value === 'boolean';
    const valueType = isBoolean ? 'Bool' : 'Int';
    const valueStr = String(value);

    return {
      model: 'vcs_AssistantMetric',
      record: {
        uid: GitHubCommon.digest(
          []
            .concat(
              // Required fields always included
              ...[
                VCSToolCategory.GitHubCopilot,
                assistantMetricType,
                startedAt.toISOString(),
                organization.uid,
                userUid,
              ],
              // Optional dimensional fields
              ...[
                {key: 'editor', value: editor},
                {key: 'feature', value: feature},
                {key: 'language', value: language},
                {key: 'model', value: model},
              ]
                .filter((v) => !isNil(v.value))
                .map((v) => `${v.key}:${v.value}`)
            )
            .join('__')
        ),
        source: this.streamName.source,
        startedAt,
        endedAt,
        type: {category: assistantMetricType},
        valueType,
        value: valueStr,
        organization,
        user: {
          uid: userUid,
          source: this.streamName.source,
        },
        tool: {category: VCSToolCategory.GitHubCopilot},
        ...(editor && {editor}),
        ...(feature && {feature}),
        ...(language && {language}),
        ...(model && {model}),
      },
    };
  }
}
