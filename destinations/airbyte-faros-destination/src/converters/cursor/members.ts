import {AirbyteRecord} from 'faros-airbyte-cdk';
import {MemberItem, UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {CursorConverter} from './common';

export class Members extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_User',
    'vcs_UserEmail',
    'vcs_UserTool',
  ];

  private static readonly usageEventsStream = new StreamName(
    'cursor',
    'usage_events'
  );

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Members.usageEventsStream];
  }

  private readonly seenUsers: {
    [email: string]: {
      name?: string;
      minUsageTimestamp?: number;
      active: boolean;
    };
  } = {};

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const member = record.record.data as MemberItem;
    const res: DestinationRecord[] = [];

    if (!this.seenUsers[member.email]) {
      this.seenUsers[member.email] = {
        name: member.name,
        active: true,
      };
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    for (const record of Object.values(
      ctx.getAll(Members.usageEventsStream.asString)
    )) {
      const dailyUsage = record.record.data as UsageEventItem;
      if (!dailyUsage.userEmail) {
        continue;
      }
      if (!this.seenUsers[dailyUsage.userEmail]) {
        this.seenUsers[dailyUsage.userEmail] = {active: false};
      }
      if (
        !this.seenUsers[dailyUsage.userEmail].minUsageTimestamp ||
        dailyUsage.minUsageTimestamp <
          this.seenUsers[dailyUsage.userEmail].minUsageTimestamp
      ) {
        this.seenUsers[dailyUsage.userEmail].minUsageTimestamp =
          dailyUsage.minUsageTimestamp;
      }
    }
    for (const [email, user] of Object.entries(this.seenUsers)) {
      res.push(
        {
          model: 'vcs_User',
          record: {
            uid: email,
            source: this.streamName.source,
            name: user.name ?? email,
            email: email,
            type: UserTypeCategory.User,
          },
        },
        {
          model: 'vcs_UserEmail',
          record: {
            user: {uid: email, source: this.streamName.source},
            email,
          },
        },
        {
          model: 'vcs_UserTool',
          record: {
            user: {uid: email, source: this.streamName.source},
            organization: {
              uid: VCSToolDetail.Cursor,
              source: this.streamName.source,
            },
            tool: {
              category: VCSToolCategory.CodingAssistant,
              detail: VCSToolDetail.Cursor,
            },
            inactive: !user.active,
            ...(user.minUsageTimestamp && {
              startedAt: Utils.toDate(user.minUsageTimestamp).toISOString(),
            }),
          },
        }
      );
    }
    res.push({
      model: 'vcs_Organization',
      record: {
        uid: VCSToolDetail.Cursor,
        source: this.streamName.source,
      },
    });
    return res;
  }
}
