import {AirbyteRecord} from 'faros-airbyte-cdk';
import {MemberItem, UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamName} from '../converter';
import {CursorConverter} from './common';

export class Members extends CursorConverter {
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
            uid: VCSToolDetail.Cursor,
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

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: VCSToolDetail.Cursor,
          source: this.streamName.source,
        },
      },
    ];
  }
}
