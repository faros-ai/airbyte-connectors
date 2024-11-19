import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  CopilotSeatEnded,
  CopilotSeatsStreamRecord,
  GitHubTool,
} from 'faros-airbyte-common/github';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AssistantMetric, GitHubConverter} from './common';

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {category: GitHubTool};
}

export class FarosCopilotSeats extends GitHubConverter {
  private readonly currentAssigneesByOrg = new Map<string, Set<string>>();
  private readonly endedSeatsByOrg = new Map<string, Set<string>>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_OrganizationTool',
    'vcs_UserTool',
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
      this.endedSeatsByOrg.set(org, new Set());
    }
    if (data.empty) {
      return [];
    }

    const seat = record.record.data as CopilotSeat | CopilotSeatEnded;
    const userTool = userToolKey(seat.user, seat.org, this.streamName.source);
    if (seat.endedAt) {
      this.endedSeatsByOrg.get(org).add(seat.user);
      return [
        {
          model: 'vcs_UserTool',
          record: {
            ...userTool,
            inactive: true,
            endedAt: seat.endedAt,
          },
        },
      ];
    }

    const activeSeat = record.record.data as CopilotSeat;
    this.currentAssigneesByOrg.get(org).add(activeSeat.user);

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
            uid: [
              'GitHubCopilot',
              AssistantMetric.LastActivity,
              recordedAt.toISOString(),
              activeSeat.org,
              activeSeat.user,
            ].join('__'),
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
            tool: {category: GitHubTool.Copilot},
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
    for (const org of this.currentAssigneesByOrg.keys()) {
      res.push({
        model: 'vcs_OrganizationTool',
        record: {
          organization: {
            uid: org,
            source: this.streamName.source,
          },
          tool: {category: GitHubTool.Copilot},
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
          USER_TOOL_QUERY,
          100,
          paginatedQueryV2,
          new Map<string, any>([
            ['source', 'GitHub'],
            ['organizationUid', toLower(org)],
            ['toolCategory', GitHubTool.Copilot],
            ['inactive', false],
          ])
        );
        for await (const previousAssignee of previousAssigneesQuery) {
          if (
            !this.currentAssigneesByOrg
              .get(org)
              .has(previousAssignee.user.uid) &&
            !this.endedSeatsByOrg.get(org).has(previousAssignee.user.uid)
          ) {
            res.push({
              model: 'vcs_UserTool',
              record: {
                ...userToolKey(
                  previousAssignee.user.uid,
                  org,
                  this.streamName.source
                ),
                inactive: true,
              },
            });
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
    tool: {category: GitHubTool.Copilot},
  };
}

const USER_TOOL_QUERY = `
  query vcs_UserTool(
    $source: String!
    $organizationUid: String!
    $toolCategory: String!
    $inactive: Boolean!
  ) {
    vcs_UserTool(
      where: {
        user: {source: {_eq: $source}}
        organization: {uid: {_eq: $organizationUid}, source: {_eq: $source}}
        toolCategory: {_eq: $toolCategory}
        inactive: {_eq: $inactive}
      }
    ) {
      user {
        uid
      }
      toolCategory
      inactive
    }
  }
`;
