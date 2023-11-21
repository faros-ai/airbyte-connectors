import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Commits extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_BranchCommitAssociation',
    'vcs_Commit',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commit = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitHubCommon.parseRepositoryKey(
      commit.repository,
      source
    );

    if (!repository) return res;

    const author = commit.author?.login
      ? {uid: commit.author.login, source}
      : null;

    res.push({
      model: 'vcs_Commit',
      record: {
        uid: commit.sha,
        sha: commit.sha,
        message: commit.commit.message,
        author,
        htmlUrl: commit.html_url,
        createdAt: Utils.toDate(commit.commit.author?.date),
        repository,
        source,
      },
    });

    if (commit.branch) {
      res.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: commit.sha, uid: commit.sha, repository},
          branch: {name: commit.branch, uid: commit.branch, repository},
        },
      });
    }

    return res;
  }
}
