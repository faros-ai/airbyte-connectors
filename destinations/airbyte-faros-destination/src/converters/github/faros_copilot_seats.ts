import {AirbyteRecord} from 'faros-airbyte-cdk';
import {VCS_USER_TOOL_QUERY} from 'faros-airbyte-common/common';
import {
  CopilotSeat,
  CopilotSeatsStreamRecord,
} from 'faros-airbyte-common/github';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {Edition} from '../../common/types';
import {AssistantMetric, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {category: VCSToolCategory.GitHubCopilot};
}

export class FarosCopilotSeats extends GitHubConverter {
  private readonly currentAssigneesByOrg = new Map<string, Set<string>>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_OrganizationTool',
    'vcs_UserTool',
    'vcs_UserToolLicense',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const data = record.record.data as CopilotSeatsStreamRecord;
    const org = toLower(data.org);
    if (!this.currentAssigneesByOrg.has(org)) {
      this.currentAssigneesByOrg.set(org, new Set());
    }
    if (data.empty) {
      return [];
    }

    const activeSeat = record.record.data as CopilotSeat;
    const userTool = userToolKey(
      activeSeat.user,
      activeSeat.org,
      this.streamName.source
    );
    this.currentAssigneesByOrg.get(org).add(activeSeat.user);
    this.collectUser(activeSeat.assignee);

    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_UserTool',
      record: {
        ...userTool,
        inactive: false,
        ...(activeSeat.startedAt && {startedAt: activeSeat.startedAt}),
        ...(activeSeat.pending_cancellation_date !== undefined && {
          endedAt: activeSeat.pending_cancellation_date
            ? Utils.toDate(activeSeat.pending_cancellation_date)
            : null,
        }),
      },
    });
    if (activeSeat.startedAt) {
      res.push({
        model: 'vcs_UserToolLicense',
        record: {
          userTool,
          startedAt: activeSeat.startedAt,
          endedAt: activeSeat.pending_cancellation_date
            ? Utils.toDate(activeSeat.pending_cancellation_date)
            : null,
          type: activeSeat.plan_type,
        },
      });
    }
    if (activeSeat.last_activity_at) {
      const lastActivityAt = Utils.toDate(activeSeat.last_activity_at);
      const recordedAt = Utils.toDate(record.record.emitted_at);
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          userTool,
          usedAt: lastActivityAt,
          recordedAt,
        },
      });
      if (ctx?.config?.edition_configs?.edition !== Edition.COMMUNITY) {
        res.push({
          model: 'vcs_AssistantMetric',
          record: {
            uid: GitHubCommon.digest(
              [
                VCSToolCategory.GitHubCopilot,
                AssistantMetric.LastActivity,
                recordedAt.toISOString(),
                activeSeat.org,
                activeSeat.user,
              ].join('__')
            ),
            source: this.streamName.source,
            startedAt: recordedAt,
            endedAt: recordedAt,
            type: {category: AssistantMetric.LastActivity},
            valueType: 'Timestamp',
            value: lastActivityAt.toISOString(),
            organization: {
              uid: org,
              source: this.streamName.source,
            },
            user: {
              uid: activeSeat.user,
              source: this.streamName.source,
            },
            tool: {category: VCSToolCategory.GitHubCopilot},
          },
        });
      }
    }
    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    res.push(...this.convertUsers());
    for (const org of this.currentAssigneesByOrg.keys()) {
      res.push({
        model: 'vcs_OrganizationTool',
        record: {
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          tool: {category: VCSToolCategory.GitHubCopilot},
          inactive: false,
        },
      });
    }
    if (!ctx.farosClient) {
      ctx.logger.warn(
        `Skipping inactive GitHub Copilot seats inference. Faros client not configured.`
      );
    } else {
      for (const org of this.currentAssigneesByOrg.keys()) {
        const previousAssigneesQuery = ctx.farosClient.nodeIterable(
          ctx.graph,
          VCS_USER_TOOL_QUERY,
          100,
          paginatedQueryV2,
          new Map<string, any>([
            ['source', 'GitHub'],
            ['organizationUid', toLower(org)],
            ['toolCategory', VCSToolCategory.GitHubCopilot],
            ['toolDetail', null],
            ['inactive', false],
          ])
        );
        const now = new Date();
        for await (const previousAssignee of previousAssigneesQuery) {
          if (
            !this.currentAssigneesByOrg.get(org).has(previousAssignee.user.uid)
          ) {
            const userTool = userToolKey(
              previousAssignee.user.uid,
              org,
              this.streamName.source
            );
            res.push({
              model: 'vcs_UserTool',
              record: {
                ...userTool,
                inactive: true,
                ...(!previousAssignee.endedAt && {endedAt: now.toISOString()}),
              },
            });
            if (previousAssignee.startedAt) {
              res.push({
                model: 'vcs_UserToolLicense',
                record: {
                  userTool,
                  startedAt: previousAssignee.startedAt,
                  ...(!previousAssignee.endedAt && {
                    endedAt: now.toISOString(),
                  }),
                },
              });
            }
          }
        }
      }
    }
    return res;
  }
}

function userToolKey(
  userLogin: string,
  orgLogin: string,
  source: string
): UserToolKey {
  return {
    user: {uid: userLogin, source},
    organization: {uid: toLower(orgLogin), source},
    tool: {category: VCSToolCategory.GitHubCopilot},
  };
}
