import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ProjectUser} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerConverter} from './common';

export class ProjectUsers extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_Membership',
  ];

  id(record: AirbyteRecord): string {
    const user = record?.record?.data as ProjectUser;
    return `${user.project.key}:${user.user.slug}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const projectUser = record.record.data as ProjectUser;
    const res: DestinationRecord[] = [];
    const {record: user, ref: userRef} = this.vcsUser(projectUser.user);

    if (!user) return res;
    res.push(user);
    res.push({
      model: 'vcs_Membership',
      record: {
        user: userRef,
        organization: this.vcsOrgRef(projectUser.project.key),
      },
    });

    return res;
  }
}
