import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CopilotSeat, GitHubTool} from 'faros-airbyte-common/github';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {category: GitHubTool};
}

export class FarosCopilotSeats extends GitHubConverter {
  private readonly orgs = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_OrganizationTool',
    'vcs_UserTool',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const seat = record.record.data as CopilotSeat;
    const userTool = userToolKey(seat.user, seat.org, this.streamName.source);
    const res: DestinationRecord[] = [];
    if (!this.orgs.has(seat.org)) {
      this.orgs.add(seat.org);
      res.push({
        model: 'vcs_OrganizationTool',
        record: {
          organization: {
            uid: toLower(seat.org),
            source: this.streamName.source,
          },
          tool: {category: GitHubTool.Copilot},
          inactive: false,
        },
      });
    }
    res.push({
      model: 'vcs_UserTool',
      record: {
        ...userTool,
        inactive: seat.inactive,
        ...(seat.created_at !== undefined && {
          startedAt: seat.created_at
            ? new Date(seat.created_at).toISOString()
            : null,
        }),
        ...(seat.pending_cancellation_date !== undefined && {
          endedAt: seat.pending_cancellation_date
            ? new Date(seat.pending_cancellation_date).toISOString()
            : null,
        }),
      },
    });
    if (seat.last_activity_at) {
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          ...userTool,
          usedAt: new Date(seat.last_activity_at).toISOString(),
        },
      });
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
