import {AirbyteRecord} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserUsage} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

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

    if (!data.user_login || !data.enterprise_id) {
      return [];
    }

    const day = Utils.toDate(data.day);
    const org = GitHubCommon.enterpriseUid(data.enterprise_id);
    const user = data.user_login;

    // Process core metrics
    this.processMetrics(res, data, day, org, user);

    // Process engagement flags
    this.processEngagementFlags(res, data, day, org, user);

    // Process IDE breakdown
    for (const ideBreakdown of data.totals_by_ide || []) {
      this.processMetrics(res, ideBreakdown, day, org, user, ideBreakdown.ide);
    }

    // Process feature breakdown
    for (const featureBreakdown of data.totals_by_feature || []) {
      this.processMetrics(
        res,
        featureBreakdown,
        day,
        org,
        user,
        undefined,
        featureBreakdown.feature
      );
    }

    // Process language+feature breakdown
    for (const item of data.totals_by_language_feature || []) {
      this.processMetrics(
        res,
        item,
        day,
        org,
        user,
        undefined,
        item.feature,
        item.language
      );
    }

    // Process language+model breakdown
    for (const item of data.totals_by_language_model || []) {
      this.processMetrics(
        res,
        item,
        day,
        org,
        user,
        undefined,
        undefined,
        item.language,
        item.model
      );
    }

    // Process model+feature breakdown
    for (const item of data.totals_by_model_feature || []) {
      this.processMetrics(
        res,
        item,
        day,
        org,
        user,
        undefined,
        item.feature,
        undefined,
        item.model
      );
    }

    return res;
  }

  private processMetrics(
    res: DestinationRecord[],
    data: any,
    day: Date,
    org: string,
    user: string,
    ide?: string,
    feature?: string,
    language?: string,
    model?: string
  ): void {
    // AILinesAdded
    if (data.loc_added_sum) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.AILinesAdded,
          data.loc_added_sum,
          ide,
          feature,
          language,
          model
        )
      );
    }

    // AILinesRemoved
    if (data.loc_deleted_sum) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.AILinesRemoved,
          data.loc_deleted_sum,
          ide,
          feature,
          language,
          model
        )
      );
    }

    // SuggestionsAccepted
    if (data.code_acceptance_activity_count) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.SuggestionsAccepted,
          data.code_acceptance_activity_count,
          ide,
          feature,
          language,
          model
        )
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
          this.getAssistantMetric(
            day,
            org,
            user,
            AssistantMetric.SuggestionsDiscarded,
            discarded,
            ide,
            feature,
            language,
            model
          )
        );
      }
    }

    // Usages
    if (data.user_initiated_interaction_count) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.Usages,
          data.user_initiated_interaction_count,
          ide,
          feature,
          language,
          model
        )
      );
    }
  }

  private processEngagementFlags(
    res: DestinationRecord[],
    data: EnterpriseCopilotUserUsage,
    day: Date,
    org: string,
    user: string
  ): void {
    if (data.used_agent) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.Engagement,
          true,
          undefined,
          'Agent'
        )
      );
    }

    if (data.used_chat) {
      res.push(
        this.getAssistantMetric(
          day,
          org,
          user,
          AssistantMetric.Engagement,
          true,
          undefined,
          'Chat'
        )
      );
    }
  }

  private getAssistantMetric(
    day: Date,
    org: string,
    user: string,
    assistantMetricType: AssistantMetric,
    value: number | boolean,
    ide?: string,
    feature?: string,
    language?: string,
    model?: string
  ): DestinationRecord {
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
                day.toISOString(),
                org,
                user,
              ],
              // Optional dimensional fields
              ...[
                {key: 'ide', value: ide},
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
        startedAt: day,
        endedAt: Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000),
        type: {category: assistantMetricType},
        valueType,
        value: valueStr,
        organization: {
          uid: org,
          source: this.streamName.source,
        },
        user: {
          uid: user,
          source: this.streamName.source,
        },
        tool: {category: VCSToolCategory.GitHubCopilot},
        ...(ide && {editor: ide}),
        ...(feature && {feature}),
        ...(language && {language}),
        ...(model && {model}),
      },
    };
  }
}
