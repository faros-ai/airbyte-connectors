import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon} from './common';
import {GitHubConverter} from './common';

export class PullRequestCommits extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestCommit',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const prCommit = record.record.data;
    const res: DestinationRecord[] = [];

    const repository: RepoKey = GitHubCommon.parseRepositoryKey(
      prCommit.repository,
      source
    );

    if (!repository) return [];

    const author = prCommit.author?.login
      ? {uid: prCommit.author.login, source}
      : null;

    const commit = {
      uid: prCommit.sha,
      sha: prCommit.sha,
      author,
      createdAt: Utils.toDate(prCommit.commit.author?.date),
      repository,
    };

    const pullRequest = {
      uid: prCommit.pull_number.toString(),
      repository,
      number: prCommit.pull_number,
    };

    res.push({
      model: 'vcs_PullRequestCommit',
      record: {
        pullRequest,
        commit,
      },
    });

    return res;
  }
}
