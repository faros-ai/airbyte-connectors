import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosUserOutput} from 'faros-airbyte-common/gitlab';
import {isEmpty, isNil, omitBy, toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class FarosUsers extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
    'vcs_UserEmail',
  ];

  async convert(
    record: AirbyteRecord
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

    // Create membership record if group_id exists
    if (user.group_id && !isEmpty(user.group_id)) {
      res.push({
        model: 'vcs_Membership',
        record: {
          user: {uid: user.username, source: this.streamName.source},
          organization: {
            uid: toLower(user.group_id),
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

    return res;
  }
}
