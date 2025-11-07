import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosUserOutput} from 'faros-airbyte-common/gitlab';
import {isEmpty, isNil, omitBy, toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabConverter} from './common';

export class FarosUsers extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
    'vcs_UserEmail',
    'tms_User',
  ];

  id(record: AirbyteRecord): string {
    const user = record?.record?.data as FarosUserOutput;
    return `${user?.username}`;
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data as FarosUserOutput;

    if (!user?.username) {
      return [];
    }

    const res: DestinationRecord[] = [];

    // Create user email record if email exists
    if (user.email && !isEmpty(user.email)) {
      res.push({
        model: 'vcs_UserEmail',
        record: {
          user: {uid: user.username, source: this.streamName.source},
          email: user.email,
        },
      });
    }

    // Create membership record for each group_id
    for (const groupId of user.group_ids) {
      res.push({
        model: 'vcs_Membership',
        record: {
          user: {uid: user.username, source: this.streamName.source},
          organization: {
            uid: toLower(groupId),
            source: this.streamName.source,
          },
        },
      });
    }

    // Create user record
    res.push({
      model: 'vcs_User',
      record: omitBy(
        {
          uid: user.username,
          source: this.streamName.source,
          name: user.name,
          email: user.email,
          htmlUrl: user.web_url,
          type: {category: 'User', detail: 'user'},
        },
        (value) => isNil(value) || isEmpty(value)
      ),
    });

    // Also write tms_User if TMS is enabled
    if (this.tmsEnabled(ctx)) {
      res.push({
        model: 'tms_User',
        record: omitBy(
          {
            uid: user.username,
            source: this.streamName.source,
            name: user.name,
            emailAddress: user.email,
          },
          (value) => isNil(value) || isEmpty(value)
        ),
      });
    }

    return res;
  }
}
