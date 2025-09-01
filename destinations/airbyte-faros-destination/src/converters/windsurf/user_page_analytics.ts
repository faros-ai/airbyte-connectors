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
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as UserTableStatsItem;

    // TODO: The Windsurf API doesn't provide a clear "first usage" date.
    // The activeDays field represents "Total active days in timeframe" but
    // it's unclear if this means consecutive days or days with actual usage.
    // For now, we don't set startedAt. Consider using the earliest of the
    // last usage timestamps or requesting this field from the Windsurf API.

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
            uid: VCSToolDetail.Windsurf,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Windsurf,
          },
          inactive: user.disableCodeium === true,
        },
      },
    ];
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: VCSToolDetail.Windsurf,
          source: this.streamName.source,
        },
      },
    ];
  }
}
