import {AirbyteRecord} from 'faros-airbyte-cdk';
import {queryVcsUserTools} from 'faros-airbyte-common/common';
import {MemberItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter} from './common';

interface UserToolKey {
  user: {uid: string; source: string};
  organization: {uid: string; source: string};
  tool: {
    category: VCSToolCategory.CodingAssistant;
    detail: VCSToolDetail.Cursor;
  };
}

export class Members extends CursorConverter {
  private readonly currentMembers = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_User',
    'vcs_UserEmail',
    'vcs_UserTool',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const member = record.record.data as MemberItem;
    if (member.active) {
      this.currentMembers.add(member.email);
    }
    return [
      {
        model: 'vcs_User',
        record: {
          uid: member.email,
          source: this.streamName.source,
          ...(member.name && {name: member.name}),
          email: member.email,
          type: UserTypeCategory.User,
        },
      },
      {
        model: 'vcs_UserEmail',
        record: {
          user: {uid: member.email, source: this.streamName.source},
          email: member.email,
        },
      },
      {
        model: 'vcs_UserTool',
        record: {
          user: {uid: member.email, source: this.streamName.source},
          organization: {
            uid: this.streamName.source,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
          inactive: !member.active,
          ...(member.minUsageTimestamp && {
            startedAt: Utils.toDate(member.minUsageTimestamp).toISOString(),
          }),
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_Organization',
      record: {
        uid: this.streamName.source,
        source: this.streamName.source,
      },
    });

    if (!ctx.farosClient) {
      ctx.logger.warn(
        `Skipping inactive Cursor members inference. Faros client not configured.`
      );
    } else {
      const previousMembersQuery = queryVcsUserTools(
        ctx.farosClient,
        ctx.graph,
        {
          source: this.streamName.source,
          organizationUid: this.streamName.source,
          toolCategory: VCSToolCategory.CodingAssistant,
          toolDetail: VCSToolDetail.Cursor,
          inactive: false,
        }
      );
      for await (const previousMember of previousMembersQuery) {
        if (!this.currentMembers.has(previousMember.user.uid)) {
          const userTool = userToolKey(
            previousMember.user.uid,
            this.streamName.source
          );
          res.push({
            model: 'vcs_UserTool',
            record: {
              ...userTool,
              inactive: true,
            },
          });
        }
      }
    }
    return res;
  }
}

function userToolKey(userEmail: string, source: string): UserToolKey {
  return {
    user: {uid: userEmail, source},
    organization: {uid: source, source},
    tool: {
      category: VCSToolCategory.CodingAssistant,
      detail: VCSToolDetail.Cursor,
    },
  };
}
