import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {some} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

type DiffStats = {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
};

export class FarosCommits extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Commit',
    'vcs_BranchCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const commit = record.record.data as Commit;
    const source = this.streamName.source;
    const diffStats = this.getDiffStats(commit);
    const author = this.collectAuthor(commit);
    const repoKey = GitHubCommon.repoKey(commit.org, commit.repo, source);
    return [
      {
        model: 'vcs_Commit',
        record: {
          uid: commit.oid,
          sha: commit.oid,
          message: Utils.cleanAndTruncate(commit.message),
          author: author ? {uid: author, source: this.streamName.source} : null,
          htmlUrl: commit.url,
          createdAt: Utils.toDate(commit.authoredDate),
          repository: repoKey,
          diffStats,
        },
      },
      {
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: commit.oid, uid: commit.oid, repository: repoKey},
          branch: {
            name: commit.branch,
            uid: commit.branch,
            repository: repoKey,
          },
        },
      },
    ];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertUsers()];
  }

  private getDiffStats(commit: Commit): DiffStats | undefined {
    return some([
      commit.additions,
      commit.deletions,
      commit.changedFilesIfAvailable,
      commit.changedFiles,
    ])
      ? {
          linesAdded: commit?.additions,
          linesDeleted: commit?.deletions,
          filesChanged: commit?.changedFilesIfAvailable ?? commit?.changedFiles,
        }
      : undefined;
  }

  private collectAuthor(commit: Commit): string | null {
    const login = commit.author?.user?.login;
    if (!login) {
      return null;
    }

    // Not all returned commits with an author have a login, for
    // example: https://github.com/microsoft/vscode/commit/a34e15b15f4fd68c655fd17438461a2f1b4260cc
    this.collectUser({
      login,
      name: commit.author.name,
      email: commit.author.email,
      html_url: commit.author.user.url,
      type: commit.author.user.type,
    });

    return login;
  }
}
