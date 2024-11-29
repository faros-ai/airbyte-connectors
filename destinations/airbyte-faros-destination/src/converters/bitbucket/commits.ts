import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';

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

    if (!workspace || !repo) {
      return res;
    }

    const commitUser = commit?.author?.user;

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commit.hash,
        uid: commit.hash,
        message: commit.message,
        htmlUrl: commit.links?.htmlUrl,
        createdAt: Utils.toDate(commit.date),
        author: commitUser?.accountId
          ? {uid: commitUser.accountId, source}
          : null,
        repository: BitbucketCommon.vcs_Repository(workspace, repo, source),
      },
    });

    return res;
  }
}
