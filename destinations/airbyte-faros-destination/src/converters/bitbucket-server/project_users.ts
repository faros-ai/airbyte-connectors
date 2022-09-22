import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ProjectUser} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerCommon, BitbucketServerConverter} from './common';

export class ProjectUsers extends BitbucketServerConverter {
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

    const user = BitbucketServerCommon.vcsUser(projectUser.user, source);
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
