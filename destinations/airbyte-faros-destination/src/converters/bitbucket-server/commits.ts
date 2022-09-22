import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/lib/bitbucket-server/types';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerConverter} from './common';

export class Commits extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Commit',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const commit = record.record.data as Commit;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      commit.computedProperties.repository.fullName.split('/');
    const repoRef = this.vcsRepoRef(project, repo);
    const {record: user, ref: author} = this.vcsUser(commit.author);
    if (!user) return res;
    res.push(user);
    res.push({
      model: 'vcs_Commit',
      record: {
        repository: repoRef,
        sha: commit.id,
        uid: commit.id,
        message: commit.message,
        createdAt: Utils.toDate(commit.committerTimestamp),
        author,
      },
    });
    return res;
  }
}
