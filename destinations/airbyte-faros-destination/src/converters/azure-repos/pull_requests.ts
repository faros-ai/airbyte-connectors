import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {VcsDiffStats} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {
  AzureReposConverter,
  MAX_DESCRIPTION_LENGTH,
  PartialUserRecord,
} from './common';
import {
  PullRequest,
  PullRequestReviewState,
  PullRequestReviewStateCategory,
  PullRequestState,
  PullRequestStateCategory,
} from './models';

interface ReviewThread {
  reviewerUid: string;
  vote: number;
  publishedDate: Date;
}

function getPartialUserRecord(obj: {
  uniqueName: string;
  displayName: string;
}): PartialUserRecord {
  if (Common.isEmail(obj.uniqueName)) {
    const email = obj.uniqueName.toLowerCase();
    return {
      uid: email,
      name: obj.displayName,
      email,
    };
  }
  return {
    uid: obj.uniqueName,
    name: obj.displayName,
  };
}

//https://docs.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests?view=azure-devops-rest-7.0#pullrequeststatus
function convertPullRequestState(
  status: string,
  mergeCommitId?: string
): PullRequestState {
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

function convertPullRequestReviewState(vote: number): PullRequestReviewState {
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
  private reviewThreads: ReviewThread[] = [];

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
    'vcs_PullRequestComment',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;

    const pullRequestItem = record.record.data as PullRequest;
    const organizationName = this.getOrganizationFromUrl(
      pullRequestItem.repository.url
    );
    const organization = {uid: organizationName, source};
    const projectRepo = this.getProjectRepo(pullRequestItem.repository);
    const repository = {
      name: projectRepo,
      uid: projectRepo,
      organization,
    };
    const pullRequest = {
      number: pullRequestItem.pullRequestId,
      uid: pullRequestItem.pullRequestId.toString(),
      repository,
    };

    const res: DestinationRecord[] = [];

    this.reviewThreads.length = 0; // clear array
    for (const thread of pullRequestItem.threads ?? []) {
      for (const comment of thread.comments) {
        const author = getPartialUserRecord(comment.author);
        res.push({
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
            author: {uid: author.uid, source},
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
    }

    const mergeCommitId = pullRequestItem.lastMergeCommit?.commitId;
    const mergeCommit = mergeCommitId
      ? {
          repository,
          sha: mergeCommitId,
          uid: mergeCommitId,
        }
      : null;

    const author = pullRequestItem.createdBy?.uniqueName
      ? getPartialUserRecord(pullRequestItem.createdBy)
      : undefined;
    if (author?.uid && !this.partialUserRecords[author.uid]) {
      this.partialUserRecords[author.uid] = author;
    }

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pullRequestItem.pullRequestId,
        uid: pullRequestItem.pullRequestId.toString(),
        title: pullRequestItem.title,
        state: convertPullRequestState(pullRequestItem.status, mergeCommitId),
        htmlUrl: pullRequestItem.url,
        createdAt: Utils.toDate(pullRequestItem.creationDate),
        updatedAt: Utils.toDate(pullRequestItem.creationDate),
        mergedAt: Utils.toDate(pullRequestItem.closedDate),
        commentCount: pullRequestItem.threads.length,
        author: author ? {uid: author.uid, source} : undefined,
        mergeCommit,
        repository,
        diffStats: this.getDiffStats(mergeCommitId),
      },
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
    return records;
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
}
