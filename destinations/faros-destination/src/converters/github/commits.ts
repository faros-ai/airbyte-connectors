import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubCommits extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_BranchCommitAssociation',
    'vcs_Commit',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const commit = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GithubCommon.parseRepositoryKey(
      commit.repository,
      source
    );

    if (!repository) return res;

    const author = commit.author ? {uid: commit.author.login, source} : null;

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commit.sha,
        message: commit.commit.message,
        author,
        htmlUrl: commit.html_url,
        createdAt: Utils.toDate(commit.commit.author?.date),
        repository,
        source,
      },
    });

    // TODO: add vcs_BranchCommitAssociation once the branch is present in commit

    return res;
  }
}
