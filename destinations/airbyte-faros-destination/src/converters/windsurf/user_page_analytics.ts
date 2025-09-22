import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UserTableStatsItem} from 'faros-airbyte-common/windsurf';

import {UserTypeCategory, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {WindsurfConverter} from './common';

export class UserPageAnalytics extends WindsurfConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_User',
    'vcs_UserEmail',
    'vcs_UserTool',
    'vcs_UserToolUsage',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as UserTableStatsItem;

    const results: DestinationRecord[] = [
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
            uid: this.streamName.source,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Windsurf,
          },
          inactive: user.disableCodeium === true,
          ...(user.minUsageTimestamp && {
            startedAt: user.minUsageTimestamp,
          }),
        },
      },
    ];

    // Add vcs_UserToolUsage records for each usage timestamp
    for (const usageTimestamp of user.usageTimestamps) {
      results.push({
        model: 'vcs_UserToolUsage',
        record: {
          userTool: {
            user: {uid: user.email, source: this.streamName.source},
            organization: {
              uid: this.streamName.source,
              source: this.streamName.source,
            },
            tool: {
              category: VCSToolCategory.CodingAssistant,
              detail: VCSToolDetail.Windsurf,
            },
          },
          usedAt: usageTimestamp,
          recordedAt: usageTimestamp,
        },
      });
    }

    return results;
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: this.streamName.source,
          source: this.streamName.source,
        },
      },
    ];
  }
}
