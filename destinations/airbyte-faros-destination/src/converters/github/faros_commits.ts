import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {some, toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

type DiffStats = {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
};

type Author = {
  uid: string;
  source: string;
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
    const author = this.getAndCollectAuthor(commit, source);
    // TODO: Replace this with common repoKey function.
    const repoKey = {
      uid: toLower(commit.repo),
      organization: {
        uid: toLower(commit.org),
        source,
      },
    };

    return [
      {
        model: 'vcs_Commit',
        record: {
          sha: commit.oid,
          message: Utils.cleanAndTruncate(commit.message),
          author,
          htmlUrl: commit.url,
          createdAt: Utils.toDate(commit.authoredDate),
          repository: repoKey,
          diffStats,
        },
      },
      {
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: commit.oid, repository: repoKey},
          branch: {name: commit.branch, repository: repoKey},
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

  private getAndCollectAuthor(
    commit: Commit,
    source: string
  ): Author | undefined {
    let author: Author;
    const user = commit.author?.user;
    if (user?.login) {
      // Not all returned commits with an author have a login, for
      // example: https://github.com/microsoft/vscode/commit/a34e15b15f4fd68c655fd17438461a2f1b4260cc
      const login = user.login;
      author = {uid: login, source};
      this.collectUser({
        login,
        name: commit.author.name,
        email: commit.author.email,
        html_url: user.url,
      });
    }
    return author;
  }
}
