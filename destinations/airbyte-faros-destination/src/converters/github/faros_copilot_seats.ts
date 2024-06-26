import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  CopilotSeat,
  CopilotSeatsStreamRecord,
  GitHubTool,
} from 'faros-airbyte-common/github';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {category: GitHubTool};
}

export class FarosCopilotSeats extends GitHubConverter {
  private readonly currentAssigneesByOrg = new Map<string, Set<string>>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_OrganizationTool',
    'vcs_UserTool',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const {empty, org} = record.record.data as CopilotSeatsStreamRecord;
    if (!this.currentAssigneesByOrg.has(org)) {
      this.currentAssigneesByOrg.set(org, new Set());
    }
    if (empty) {
      return [];
    }
    const seat = record.record.data as CopilotSeat;
    this.currentAssigneesByOrg.get(org).add(seat.user);

    const userTool = userToolKey(seat.user, seat.org, this.streamName.source);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_UserTool',
      record: {
        ...userTool,
        inactive: false,
        ...(seat.created_at !== undefined && {
          startedAt: seat.created_at ? Utils.toDate(seat.created_at) : null,
        }),
        ...(seat.pending_cancellation_date !== undefined && {
          endedAt: seat.pending_cancellation_date
            ? Utils.toDate(seat.pending_cancellation_date)
            : null,
        }),
      },
    });
    if (seat.last_activity_at) {
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          ...userTool,
          usedAt: Utils.toDate(seat.last_activity_at),
        },
      });
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
            !this.currentAssigneesByOrg.get(org).has(previousAssignee.user.uid)
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
    user: {uid: toLower(userLogin), source},
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
