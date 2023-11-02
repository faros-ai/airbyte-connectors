import {AirbyteRecord} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/bitbucket-server';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class Users extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const {record: user} = this.vcsUser(record.record.data as User);

    if (!user) return res;
    res.push(user);

    return res;
  }
}
