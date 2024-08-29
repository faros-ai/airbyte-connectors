import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketConverter} from './common';

export class Commits extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.hash;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commit = record.record.data as Commit;
    const res: DestinationRecord[] = [];

    const [workspace, repo] = commit.repository.fullName.split('/');

    let author = null;
    if (commit?.author?.user?.accountId) {
      const commitUser = commit.author.user;
      this.collectUser(commitUser);
      author = {uid: commitUser.accountId, source};
    }
    if (!workspace || !repo) {
      return res;
    }

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commit.hash,
        uid: commit.hash,
        message: commit.message,
        htmlUrl: commit.links?.htmlUrl,
        createdAt: Utils.toDate(commit.date),
        author,
        repository: {
          organization: {uid: workspace.toLowerCase(), source},
          uid: repo.toLowerCase(),
          name: repo.toLowerCase(),
        },
      },
    });

    return res;
  }
}
