import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {Commit} from './types';

export class BitbucketCommits extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Commit',
    'vcs_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const commit = record.record.data as Commit;
    const res: DestinationRecord[] = [];

    const [workspace, repo] = commit.repository.fullName.split('/');

    let author = null;
    if (commit?.author?.user?.accountId) {
      const commitUser = commit.author.user;
      const user = BitbucketCommon.vcsUser(commitUser, source);
      if (user) {
        res.push(user);
        author = {uid: commitUser.accountId, source};
      }
    }

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commit.hash,
        message: commit.message,
        htmlUrl: commit.links.htmlUrl,
        createdAt: Utils.toDate(commit.date),
        author,
        repository: {
          organization: {uid: workspace.toLowerCase(), source},
          name: repo.toLowerCase(),
        },
      },
    });

    return res;
  }
}
