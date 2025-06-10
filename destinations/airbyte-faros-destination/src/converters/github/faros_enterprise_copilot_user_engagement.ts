import {AirbyteRecord} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserEngagement} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

const engagementFieldToFeature: Record<string, string> = {
  cli_engagement: 'CLI',
  code_completion_engagement: 'Code Completion',
  code_review_engagement: 'Code Review',
  dotcom_chat_engagement: 'Dotcom Chat',
  inline_chat_engagement: 'Inline Chat',
  knowledge_base_chat_engagement: 'Knowledge Base Chat',
  mobile_chat_engagement: 'Mobile Chat',
  panel_chat_engagement: 'Panel Chat',
  pull_request_summary_engagement: 'Pull Request Summary',
};

export class FarosEnterpriseCopilotUserEngagement extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    const enterpriseCopilotUserEngagement = record.record
      .data as EnterpriseCopilotUserEngagement;
    const day = Utils.toDate(enterpriseCopilotUserEngagement.date);
    const org = GitHubCommon.enterpriseUid(
      enterpriseCopilotUserEngagement.enterprise
    );
    const user = enterpriseCopilotUserEngagement.login;

    for (const [field, feature] of Object.entries(engagementFieldToFeature)) {
      if (
        enterpriseCopilotUserEngagement[
          field as keyof EnterpriseCopilotUserEngagement
        ] === 1
      ) {
        res.push(...this.getAssistantMetric(day, org, user, feature));
      }
    }

    return res;
  }

  private getAssistantMetric(
    day: Date,
    org: string,
    user: string,
    feature: string
  ): DestinationRecord[] {
    return [
      {
        model: 'vcs_AssistantMetric',
        record: {
          uid: GitHubCommon.digest(
            [
              VCSToolCategory.GitHubCopilot,
              AssistantMetric.Engagement,
              day.toISOString(),
              org,
              user,
              feature,
            ].join('__')
          ),
          source: this.streamName.source,
          startedAt: day,
          endedAt: Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000),
          type: {category: AssistantMetric.Engagement},
          valueType: 'Bool',
          value: 'true',
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          user: {
            uid: user,
            source: this.streamName.source,
          },
          tool: {category: VCSToolCategory.GitHubCopilot},
          feature,
        },
      },
    ];
  }
}
