import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UserItem} from 'faros-airbyte-common/claude';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClaudeConverter} from './common';

export class Users extends ClaudeConverter {
  private readonly currentUsers = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_User',
    'vcs_UserEmail',
    'vcs_UserTool',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as UserItem;
    this.currentUsers.add(user.email);

    return [
      {
        model: 'vcs_User',
        record: {
          uid: user.email,
          source: this.streamName.source,
          ...(user.name && {name: user.name}),
          email: user.email,
          type: UserTypeCategory.User,
        },
      },
      {
        model: 'vcs_UserEmail',
        record: {
          user: {uid: user.email, source: this.streamName.source},
          email: user.email,
        },
      },
      {
        model: 'vcs_UserTool',
        record: {
          user: {uid: user.email, source: this.streamName.source},
          organization: {
            uid: VCSToolDetail.ClaudeCode,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.ClaudeCode,
          },
          inactive: false,
          startedAt: Utils.toDate(user.added_at).toISOString(),
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    // Always add the organization (using the same uid as the tool detail)
    res.push({
      model: 'vcs_Organization',
      record: {
        uid: VCSToolDetail.ClaudeCode,
        source: this.streamName.source,
      },
    });

    if (!ctx.farosClient) {
      ctx.logger.warn(
        `Skipping inactive Claude Code users inference. Faros client not configured.`
      );
    } else {
      // Query for existing active users
      const previousUsersQuery = ctx.farosClient.nodeIterable(
        ctx.graph,
        USER_TOOL_QUERY,
        100,
        paginatedQueryV2,
        new Map<string, any>([
          ['source', this.streamName.source],
          ['organizationUid', VCSToolDetail.ClaudeCode],
          ['toolCategory', VCSToolCategory.CodingAssistant],
          ['toolDetail', VCSToolDetail.ClaudeCode],
          ['inactive', false],
        ])
      );

      const now = new Date();
      for await (const previousUser of previousUsersQuery) {
        // If user is not in current users set, mark as inactive
        if (!this.currentUsers.has(previousUser.user.uid)) {
          res.push({
            model: 'vcs_UserTool',
            record: {
              user: {
                uid: previousUser.user.uid,
                source: this.streamName.source,
              },
              organization: {
                uid: VCSToolDetail.ClaudeCode,
                source: this.streamName.source,
              },
              tool: {
                category: VCSToolCategory.CodingAssistant,
                detail: VCSToolDetail.ClaudeCode,
              },
              inactive: true,
              ...(!previousUser.endedAt && {endedAt: now.toISOString()}),
            },
          });
        }
      }
    }

    return res;
  }
}

const USER_TOOL_QUERY = `
  query vcs_UserTool(
    $source: String!
    $organizationUid: String!
    $toolCategory: String!
    $toolDetail: String!
    $inactive: Boolean!
  ) {
    vcs_UserTool(
      where: {
        user: {source: {_eq: $source}}
        organization: {uid: {_eq: $organizationUid}, source: {_eq: $source}}
        toolCategory: {_eq: $toolCategory}
        toolDetail: {_eq: $toolDetail}
        inactive: {_eq: $inactive}
      }
    ) {
      user {
        uid
      }
      toolCategory
      toolDetail
      inactive
      startedAt
      endedAt
    }
  }
`;
