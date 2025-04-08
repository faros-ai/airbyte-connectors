import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GitPullRequestCommentThread} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequest} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {getOrganization} from '../common/azure-devops';
import {CategoryDetail, Common} from '../common/common';
import {
  BranchCollector,
  PullRequestKey,
  PullRequestReviewStateCategory,
  PullRequestStateCategory,
  VcsDiffStats,
} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  AzureReposConverter,
  MAX_DESCRIPTION_LENGTH,
  PartialUserRecord,
} from './common';

const BRANCH_REF_NAME_PREFIX = 'refs/heads/';

interface ReviewThread {
  reviewerUid: string;
  vote: number;
  publishedDate: Date;
}

function getPartialUserRecord(user: IdentityRef): PartialUserRecord {
  if (Common.isEmail(user.uniqueName)) {
    const email = user.uniqueName.toLowerCase();
    return {
      uid: email,
      name: user.displayName,
      email,
    };
  }
  return {
    uid: user.uniqueName,
    name: user.displayName,
  };
}

//https://docs.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests?view=azure-devops-rest-7.0#pullrequeststatus
function convertPullRequestState(
  status: string,
  mergeCommitId?: string
): CategoryDetail {
  switch (status) {
    case 'completed':
      return {
        category: mergeCommitId
          ? PullRequestStateCategory.Merged
          : PullRequestStateCategory.Closed,
        detail: status,
      };
    case 'active':
      return {
        category: mergeCommitId
          ? PullRequestStateCategory.Merged
          : PullRequestStateCategory.Open,
        detail: status,
      };
    case 'notSet':
      return {
        category: PullRequestStateCategory.Open,
        detail: status,
      };
    case 'abandoned':
      return {
        category: PullRequestStateCategory.Closed,
        detail: status,
      };
    default:
      return {
        category: PullRequestStateCategory.Custom,
        detail: status,
      };
  }
}

function convertPullRequestReviewState(vote: number): CategoryDetail {
  if (vote > 5)
    return {
      category: PullRequestReviewStateCategory.Approved,
      detail: `vote ${vote}`,
    };
  if (vote > 0)
    return {
      category: PullRequestReviewStateCategory.Commented,
      detail: `vote ${vote}`,
    };
  if (vote > -5)
    return {
      category: PullRequestReviewStateCategory.Custom,
      detail: `vote ${vote}`,
    };
  return {
    category: PullRequestReviewStateCategory.Dismissed,
    detail: `vote ${vote}`,
  };
}

export class PullRequests extends AzureReposConverter {
  private partialUserRecords: Record<string, PartialUserRecord> = {};
  private readonly reviewThreads: ReviewThread[] = [];
  private readonly branchCollector = new BranchCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
    'vcs_PullRequestComment',
  ];

  // TODO: Review commits and work items associations
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;

    const pullRequestItem = record.record.data as PullRequest;
    const organizationName = getOrganization(
      pullRequestItem.repository.url
    );
    const organization = {uid: organizationName, source};
    if (!pullRequestItem.repository) {
      ctx.logger.error(
        `No repository found for pull request ${pullRequestItem.pullRequestId}`
      );
      return [];
    }

    const repository = this.getProjectRepo(
      pullRequestItem.repository,
      organization
    );

    const pullRequest: PullRequestKey = {
      number: pullRequestItem.pullRequestId,
      uid: pullRequestItem.pullRequestId.toString(),
      repository,
    };

    const res: DestinationRecord[] = [];

    this.reviewThreads.length = 0; // clear array
    const {maxThreadLastUpdatedDate, comments} = this.getReviewComments(
      pullRequestItem.threads,
      pullRequest
    );
    res.push(...comments);

    const mergeCommitId = pullRequestItem.lastMergeCommit?.commitId;
    const mergeCommit = mergeCommitId
      ? {
          repository,
          sha: mergeCommitId,
          uid: mergeCommitId,
        }
      : null;
    const mergedAtRawDate =
      pullRequestItem.lastMergeCommit?.committer?.date ||
      pullRequestItem.lastMergeCommit?.author?.date ||
      pullRequestItem.closedDate;

    const author = pullRequestItem.createdBy?.uniqueName
      ? getPartialUserRecord(pullRequestItem.createdBy)
      : undefined;
    if (author?.uid && !this.partialUserRecords[author.uid]) {
      this.partialUserRecords[author.uid] = author;
    }

    const sourceBranchName = this.getBranchName(pullRequestItem.sourceRefName);
    const targetBranchName = this.getBranchName(pullRequestItem.targetRefName);
    const sourceBranch = this.branchCollector.collectBranch(
      sourceBranchName,
      repository
    );
    const targetBranch = this.branchCollector.collectBranch(
      targetBranchName,
      repository
    );

    const prRecord = {
      number: pullRequestItem.pullRequestId,
      uid: pullRequestItem.pullRequestId.toString(),
      title: pullRequestItem.title,
      state: convertPullRequestState(pullRequestItem.status, mergeCommitId),
      htmlUrl: pullRequestItem.url,
      createdAt: Utils.toDate(pullRequestItem.creationDate),
      updatedAt:
        maxThreadLastUpdatedDate ?? Utils.toDate(pullRequestItem.creationDate),
      mergedAt: mergeCommitId ? Utils.toDate(mergedAtRawDate) : undefined,
      commentCount: pullRequestItem.threads.length,
      author: author ? {uid: author.uid, source} : undefined,
      mergeCommit,
      sourceBranchName,
      sourceBranch,
      targetBranchName,
      targetBranch,
      repository,
    };
    const diffStats = this.getDiffStats(mergeCommitId);
    if (diffStats) {
      prRecord['diffStats'] = diffStats;
    }
    res.push({
      model: 'vcs_PullRequest',
      record: prRecord,
    });

    for (const reviewer of pullRequestItem.reviewers ?? []) {
      const reviewerUser = reviewer?.uniqueName
        ? getPartialUserRecord(reviewer)
        : undefined;

      const reviewThread = this.reviewThreads.find(
        (ts) =>
          ts.reviewerUid === reviewer.uniqueName && ts.vote === reviewer.vote
      );

      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: this.convertStringToNumber(reviewer.id),
          uid: reviewer.id,
          htmlUrl: reviewer.url,
          state: convertPullRequestReviewState(reviewer.vote),
          submittedAt: reviewThread?.publishedDate,
          reviewer: reviewerUser ? {uid: reviewerUser.uid, source} : undefined,
          pullRequest,
        },
      });

      if (reviewerUser?.uid && !this.partialUserRecords[reviewerUser.uid]) {
        this.partialUserRecords[reviewerUser.uid] = reviewerUser;
      }
    }

    return res;
  }

  private getReviewComments(
    threads: GitPullRequestCommentThread[],
    pullRequest: PullRequestKey
  ): {
    maxThreadLastUpdatedDate: Date | undefined;
    comments: DestinationRecord[];
  } {
    const comments: DestinationRecord[] = [];
    let maxThreadLastUpdatedDate: Date | undefined;
    for (const thread of threads ?? []) {
      for (const comment of thread.comments) {
        const author = getPartialUserRecord(comment.author);
        comments.push({
          model: 'vcs_PullRequestComment',
          record: {
            number: comment.id,
            uid: comment.id.toString(),
            comment: Utils.cleanAndTruncate(
              comment.content,
              MAX_DESCRIPTION_LENGTH
            ),
            createdAt: Utils.toDate(comment.publishedDate),
            updatedAt: Utils.toDate(comment.lastUpdatedDate),
            author: {uid: author.uid, source: this.streamName.source},
            pullRequest,
          },
        });
      }

      const properties = thread.properties ?? {};
      const vote = parseInt(properties['CodeReviewVoteResult']?.$value);
      const voteIdentityRef = properties['CodeReviewVotedByIdentity']?.$value;
      const voteIdentity = thread.identities?.[voteIdentityRef];
      if (Number.isInteger(vote) && voteIdentity?.uniqueName) {
        this.reviewThreads.push({
          reviewerUid: voteIdentity.uniqueName,
          vote,
          publishedDate: Utils.toDate(thread.publishedDate),
        });
      }

      if (thread.lastUpdatedDate) {
        const lastUpdatedDate = Utils.toDate(thread.lastUpdatedDate);
        if (
          !maxThreadLastUpdatedDate ||
          lastUpdatedDate > maxThreadLastUpdatedDate
        ) {
          maxThreadLastUpdatedDate = lastUpdatedDate;
        }
      }
    }
    return {maxThreadLastUpdatedDate, comments};
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const records: DestinationRecord[] = [];
    for (const uid in this.partialUserRecords) {
      if (this.uidsFromUsersStream.has(uid)) {
        continue;
      }
      records.push({
        model: 'vcs_User',
        record: {...this.partialUserRecords[uid], source},
      });
    }
    return [...records, ...this.branchCollector.convertBranches()];
  }

  getDiffStats(mergeCommitId?: string): VcsDiffStats | undefined {
    if (
      !mergeCommitId ||
      this.commitChangeCounts[mergeCommitId] === undefined
    ) {
      return undefined;
    }
    return {
      filesChanged: this.commitChangeCounts[mergeCommitId],
      linesAdded: 0, // TODO: get this from file diff api
      linesDeleted: 0,
    };
  }

  private getBranchName(branchRefName: string): string {
    if (!branchRefName) {
      return undefined;
    }
    if (branchRefName.startsWith(BRANCH_REF_NAME_PREFIX)) {
      return branchRefName.slice(BRANCH_REF_NAME_PREFIX.length);
    }
    return branchRefName;
  }
}
