import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UserItem} from 'faros-airbyte-common/claude';
import {Utils} from 'faros-js-client';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {ClaudeCodeConverter} from './common';

export class Users extends ClaudeCodeConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_User',
    'vcs_UserEmail',
    'vcs_UserTool',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as UserItem;

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

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: VCSToolDetail.ClaudeCode,
          source: this.streamName.source,
        },
      },
    ];
  }
}
