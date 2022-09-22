import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {ProjectUser} from './types';

export class ProjectUsers extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const projectUser = record.record.data as ProjectUser;
    const res: DestinationRecord[] = [];

    const user = BitbucketCommon.vcsUser(projectUser.user, source);
    if (!user) return res;

    res.push(user);
    res.push({
      model: 'vcs_Membership',
      record: {
        user: {uid: projectUser.user.accountId, source},
        organization: {uid: projectUser.project.slug.toLowerCase(), source},
      },
    });

    return res;
  }
}
