import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {
  AzureReposConverter,
  MAX_DESCRIPTION_LENGTH,
  PartialUserRecord,
} from './common';
import {PullRequest} from './models';

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

export class PullRequests extends AzureReposConverter {
  private partialUserRecords: Record<string, PartialUserRecord> = {};

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
        state: this.convertPullRequestState(pullRequestItem.status),
        htmlUrl: pullRequestItem.url,
        createdAt: Utils.toDate(pullRequestItem.creationDate),
        updatedAt: Utils.toDate(pullRequestItem.creationDate),
        mergedAt: Utils.toDate(pullRequestItem.closedDate),
        commentCount: pullRequestItem.threads.length,
        author,
        mergeCommit,
        repository,
      },
    });

    for (const reviewer of pullRequestItem.reviewers ?? []) {
      const reviewerUser = reviewer?.uniqueName
        ? getPartialUserRecord(reviewer)
        : undefined;

      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: this.convertStringToNumber(reviewer.id),
          uid: reviewer.id,
          htmlUrl: reviewer.url,
          state: this.convertPullRequestReviewState(reviewer.vote),
          submittedAt: null,
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
}
