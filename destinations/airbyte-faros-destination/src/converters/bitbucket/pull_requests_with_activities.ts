import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  PRActivity,
  PRDiffStat,
  PullRequest,
  PullRequestOrActivity,
  User,
} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {FileCollector, RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter, CategoryRef} from './common';

enum PullRequestStateCategory {
  CLOSED = 'Closed',
  MERGED = 'Merged',
  OPEN = 'Open',
  CUSTOM = 'Custom',
}

enum PullRequestReviewStateCategory {
  APPROVED = 'Approved',
  COMMENTED = 'Commented',
  CHANGES_REQUESTED = 'ChangesRequested',
  DISMISSED = 'Dismissed',
  CUSTOM = 'Custom',
}

interface DiffStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

export class PullRequestsWithActivities extends BitbucketConverter {
  private readonly fileCollector = new FileCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_File',
    'vcs_PullRequest',
    'vcs_PullRequestComment',
    'vcs_PullRequestFile',
    'vcs_PullRequestReview',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const {type, pullRequest, activity} = record.record
      .data as PullRequestOrActivity;
    if (type === 'PullRequest') {
      return this.processPullRequest(pullRequest, ctx);
    } else if (type === 'PullRequestActivity') {
      return this.processActivity(activity, ctx);
    }
    return [];
  }

  private processPullRequest(pullRequest: PullRequest, ctx: StreamContext) {
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];
    const [workspace, repo] = (
      pullRequest?.source?.repository?.fullName ||
      pullRequest?.destination?.repository?.fullName ||
      ''
    ).split('/');
    if (!workspace || !repo) return res;

    const repoKey = BitbucketCommon.vcs_Repository(workspace, repo, source);

    const commitHash = pullRequest?.mergeCommit?.hash;
    const mergeCommit = commitHash
      ? {repository: repoKey, sha: commitHash, uid: commitHash}
      : null;

    let author = null;
    if (pullRequest?.author?.accountId) {
      author = {uid: pullRequest.author.accountId, source};
    }

    pullRequest.diffStats?.forEach((diff) => {
      res.push(...this.processDiffStat(repoKey, pullRequest, diff));
    });

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pullRequest.id,
        uid: pullRequest.id.toString(),
        title: pullRequest.title,
        description: Utils.cleanAndTruncate(
          pullRequest.description,
          this.maxDescriptionLength(ctx)
        ),
        state: this.toPrState(pullRequest.state),
        htmlUrl: pullRequest?.links?.htmlUrl,
        createdAt: Utils.toDate(pullRequest.createdOn),
        updatedAt: Utils.toDate(pullRequest.updatedOn),
        mergedAt: Utils.toDate(pullRequest.calculatedActivity?.mergedAt),
        closedAt: Utils.toDate(pullRequest.closedOn),
        commentCount: pullRequest.commentCount,
        commitCount: pullRequest.calculatedActivity?.commitCount,
        diffStats: this.calculateDiffStats(pullRequest),
        author,
        mergeCommit,
        repository: repoKey,
      },
    });
    return res;
  }

  private processDiffStat(
    repoKey: RepoKey,
    pullRequest: PullRequest,
    diff: PRDiffStat
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];

    const processDiffPath = (path: string): DestinationRecord => {
      this.fileCollector.collectFile(path, repoKey);
      return {
        model: 'vcs_PullRequestFile',
        record: {
          pullRequest: {
            number: pullRequest.id,
            uid: pullRequest.id.toString(),
            repository: repoKey,
          },
          file: {uid: path, repository: repoKey},
          additions: diff.linesAdded,
          deletions: diff.linesRemoved,
        },
      };
    };

    if (diff.old?.path) {
      res.push(processDiffPath(diff.old.path));
    }
    if (diff.new?.path && diff.new.path !== diff.old?.path) {
      res.push(processDiffPath(diff.new.path));
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.fileCollector.convertFiles()];
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

  private processActivity(
    prActivity: PRActivity,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const res: DestinationRecord[] = [];

    const change =
      prActivity?.comment ??
      prActivity?.approval ??
      prActivity?.changes_requested ??
      prActivity?.update;

    const date = Utils.toDate(
      change?.date ?? change?.updated_on ?? change?.created_on
    );

    const state = this.reviewState(prActivity);
    if (!change || !state) return res;

    const id = change?.id ?? date?.getUTCMilliseconds();

    if (!id) {
      ctx.logger.info(
        `Ignored activity for pull request ${
          prActivity.pullRequest.id
        } in repo ${
          prActivity.pullRequest.repositorySlug
        }, since it has no id: ${JSON.stringify(change)}`
      );
      return res;
    }

    const user: User = change?.author ?? change?.user;
    const reviewer = user?.accountId ? {uid: user.accountId, source} : null;
    const {workspace, repositorySlug} = prActivity.pullRequest;
    if (!workspace || !repositorySlug) {
      ctx.logger.info(
        `Pull request activity has no repository or workspace ref: ${JSON.stringify(prActivity)}`
      );
      return res;
    }
    const repoRef = BitbucketCommon.vcs_Repository(
      workspace,
      repositorySlug,
      source
    );

    const pullRequest = {
      repository: repoRef,
      number: prActivity.pullRequest.id,
      uid: prActivity.pullRequest.id.toString(),
    };
    if (prActivity?.comment) {
      res.push({
        model: 'vcs_PullRequestComment',
        record: {
          number: id,
          uid: id.toString(),
          comment: Utils.cleanAndTruncate(
            change?.content?.raw,
            BitbucketCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(change?.created_on),
          updatedAt: Utils.toDate(change?.updated_on),
          author: reviewer,
          pullRequest,
        },
      });
    }
    res.push({
      model: 'vcs_PullRequestReview',
      record: {
        number: id,
        uid: id.toString(),
        htmlUrl: prActivity.pullRequest.links.htmlUrl,
        pullRequest,
        reviewer,
        state,
        submittedAt: date,
      },
    });

    return res;
  }

  reviewState(
    prActivity: PRActivity
  ): {category: string; detail: string | null} | undefined {
    // We are only considering a subset of activities on the PR and ignoring everything else
    if (prActivity?.comment)
      return {category: PullRequestReviewStateCategory.COMMENTED, detail: null};
    if (prActivity?.approval)
      return {category: PullRequestReviewStateCategory.APPROVED, detail: null};
    if (prActivity?.changes_requested)
      return {
        category: PullRequestReviewStateCategory.CHANGES_REQUESTED,
        detail: null,
      };
    if (prActivity?.update && prActivity?.update?.state === 'DECLINED')
      return {category: PullRequestReviewStateCategory.DISMISSED, detail: null};
    return undefined;
  }

  private calculateDiffStats(pullRequest: PullRequest): DiffStats | null {
    if (!pullRequest.diffStats) {
      return null;
    }

    const filesChanged = new Set(
      pullRequest.diffStats
        .flatMap((diff) => [diff.old?.path, diff.new?.path])
        .filter((path) => !isNil(path))
    ).size;

    const linesAdded = pullRequest.diffStats.reduce(
      (sum, diff) => sum + diff.linesAdded,
      0
    );

    const linesDeleted = pullRequest.diffStats.reduce(
      (sum, diff) => sum + diff.linesRemoved,
      0
    );

    return {
      filesChanged,
      linesAdded,
      linesDeleted,
    };
  }
}
