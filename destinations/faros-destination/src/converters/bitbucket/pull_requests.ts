import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketCommon, BitbucketConverter, CategoryRef} from './common';
import {PullRequest} from './types';

enum PullRequestStateCategory {
  CLOSED = 'Closed',
  MERGED = 'Merged',
  OPEN = 'Open',
  CUSTOM = 'Custom',
}

export class BitbucketPullRequests extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_PullRequest',
  ];

  private readonly commitsStream = new StreamName('bitbucket', 'commits');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.commitsStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pr = record.record.data as PullRequest;
    const res: DestinationRecord[] = [];

    const [workspace, repo] = pr.source?.repository?.fullName?.split('/');
    const repoRef = {
      organization: {uid: workspace.toLowerCase(), source},
      name: repo.toLowerCase(),
    };
    // Get full commit hash by fetching the commit by short hash
    let mergeCommit = null;
    const shortHash = pr?.mergeCommit?.hash;
    if (shortHash) {
      const commitsStream = this.commitsStream.asString;
      const commitRecords = ctx.getAll(commitsStream);
      const commitHash = Object.keys(commitRecords).find((k: string) =>
      k.startsWith(shortHash)
      );
      mergeCommit = {repository: repoRef, sha: commitHash};
    }

    let author = null;
    if (pr?.author?.accountId) {
      const user = BitbucketCommon.vcsUser(pr.author, source);

      if (!user) return res;
      res.push(user);
      author = {uid: pr.author.accountId, source};
    }

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pr.id,
        title: pr.title,
        state: this.toPrState(pr.state),
        htmlUrl: pr?.links?.htmlUrl,
        createdAt: Utils.toDate(pr.createdOn),
        updatedAt: Utils.toDate(pr.updatedOn),
        mergedAt: pr.calculatedActivity?.mergedAt ?? null,
        commentCount: pr.commentCount,
        commitCount: pr.calculatedActivity?.commitCount,
        diffStats: pr.diffStat,
        author,
        mergeCommit,
        repository: repoRef,
      },
    });

    return res;
  }

  private toPrState(state: string): CategoryRef {
    const stateLower = state.toLowerCase();
    switch (stateLower) {
      case 'open':
        return {category: PullRequestStateCategory.OPEN, detail: stateLower};
      case 'merged':
        return {category: PullRequestStateCategory.MERGED, detail: stateLower};
      case 'superseded':
      case 'declined':
        return {category: PullRequestStateCategory.CLOSED, detail: stateLower};
      default:
        return {category: PullRequestStateCategory.CUSTOM, detail: stateLower};
    }
  }
}
