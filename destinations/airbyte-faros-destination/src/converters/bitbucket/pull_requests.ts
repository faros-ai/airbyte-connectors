import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketCommon, BitbucketConverter, CategoryRef} from './common';

enum PullRequestStateCategory {
  CLOSED = 'Closed',
  MERGED = 'Merged',
  OPEN = 'Open',
  CUSTOM = 'Custom',
}

export class PullRequests extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_User',
    'vcs_PullRequest',
  ];

  private readonly commitsStream = new StreamName('bitbucket', 'commits');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.commitsStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pr = record.record.data as PullRequest;
    const res: DestinationRecord[] = [];

    const [workspace, repo] = (
      pr?.source?.repository?.fullName ||
      pr?.destination?.repository?.fullName ||
      ''
    ).split('/');
    if (!workspace || !repo) return res;

    const repoRef = {
      organization: {uid: workspace.toLowerCase(), source},
      uid: repo.toLowerCase(),
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
      if (commitHash) {
        mergeCommit = {repository: repoRef, sha: commitHash, uid: commitHash};
      }
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
        uid: pr.id.toString(),
        title: pr.title,
        description: pr.description,
        state: this.toPrState(pr.state),
        htmlUrl: pr?.links?.htmlUrl,
        createdAt: Utils.toDate(pr.createdOn),
        updatedAt: Utils.toDate(pr.updatedOn),
        mergedAt: Utils.toDate(pr.calculatedActivity?.mergedAt),
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
    const stateLower = state?.toLowerCase();
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
