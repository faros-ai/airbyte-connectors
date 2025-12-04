import {AirbyteRecord} from 'faros-airbyte-cdk';
import {EnterpriseCopilotUserUsage} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {OrgKey, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosEnterpriseCopilotUserUsage extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
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

    const startedAt = day;
    const endedAt = Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000);

    res.push({
      model: 'vcs_AssistantMetric',
      record: {
        uid: GitHubCommon.digest(
          []
            .concat(
              // Required fields always included
              ...[
                VCSToolCategory.GitHubCopilot,
                'enterprise_copilot_user_usage__v1',
                startedAt.toISOString(),
                organization.uid,
                userUid,
              ]
            )
            .join('__')
        ),
        source: this.streamName.source,
        startedAt,
        endedAt,
        type: {category: 'Raw', detail: 'enterprise_copilot_user_usage__v1'},
        valueType: 'Raw',
        jsonValue: data,
        organization,
        user: {
          uid: userUid,
          source: this.streamName.source,
        },
        tool: {category: VCSToolCategory.GitHubCopilot},
      },
    });

    if (this.usageDetected(data)) {
      res.push(this.getUsageRecord(day, organization, userUid));
    }

    return res;
  }

  private usageDetected({
    user_initiated_interaction_count,
    code_generation_activity_count,
    code_acceptance_activity_count,
    loc_suggested_to_add_sum,
    loc_suggested_to_delete_sum,
    loc_added_sum,
    loc_deleted_sum,
    used_agent,
    used_chat,
  }: EnterpriseCopilotUserUsage): boolean {
    return (
      !!user_initiated_interaction_count ||
      !!code_generation_activity_count ||
      !!code_acceptance_activity_count ||
      !!loc_suggested_to_add_sum ||
      !!loc_suggested_to_delete_sum ||
      !!loc_added_sum ||
      !!loc_deleted_sum ||
      !!used_agent ||
      !!used_chat
    );
  }

  private getUsageRecord(
    day: Date,
    organization: OrgKey,
    userUid: string
  ): DestinationRecord {
    return {
      model: 'vcs_UserToolUsage',
      record: {
        userTool: {
          user: {uid: userUid, source: this.streamName.source},
          organization: {uid: organization.uid, source: this.streamName.source},
          tool: {category: VCSToolCategory.GitHubCopilot},
        },
        usedAt: day.toISOString(),
        recordedAt: day.toISOString(),
      },
    };
  }
}
