import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket-server';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class Commits extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const commit = record.record.data as Commit;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      commit.computedProperties.repository.fullName.split('/');
    const repoRef = this.vcsRepoKey(project, repo);
    const {record: user, ref: author} = this.vcsUser(commit.author);

    if (!user) return res;

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
