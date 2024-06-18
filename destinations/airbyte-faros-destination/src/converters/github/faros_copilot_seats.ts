import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CopilotSeat} from 'faros-airbyte-common/github';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

enum GitHubTool {
  Copilot = 'GitHubCopilot',
}

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {category: GitHubTool};
}

export class FarosCopilotSeats extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_UserTool',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const seat = record.record.data as CopilotSeat;
    const userTool = userToolKey(seat.user, seat.org, this.streamName.source);
    const res: DestinationRecord[] = [
      {
        model: 'vcs_UserTool',
        record: {
          ...userTool,
          inactive: false,
          startedAt: seat.created_at,
          endedAt: seat.pending_cancellation_date,
        },
      },
    ];
    if (seat.last_activity_at) {
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          ...userTool,
          usedAt: seat.last_activity_at,
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
    user: {uid: toLower(userLogin), source: source},
    organization: {uid: toLower(orgLogin), source: source},
    tool: {category: GitHubTool.Copilot},
  };
}
