import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzuregitConverter} from './common';
import {OrgTypeCategory, PullRequest} from './models';

export class AzuregitPullRequests extends AzuregitConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
    'vcs_PullRequestComment',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pullRequestItem = record.record.data as PullRequest;
    const pullRequest = {number: String(pullRequestItem.pullRequestId)};
    const repository = {uid: pullRequestItem.repository.id};
    const res: DestinationRecord[] = [];

    const diffStats = {linesAdded: 0, linesDeleted: 0, filesChanged: 0};

    for (const thread of pullRequestItem.threads) {
      for (const comment of thread.comments) {
        res.push({
          model: 'vcs_PullRequestComment',
          record: {
            number: String(comment.id),
            comment: comment.content,
            createdAt: Utils.toDate(comment.publishedDate),
            updatedAt: Utils.toDate(comment.lastUpdatedDate),
            author: {uid: comment.author.id, source},
            pullRequest,
          },
        });
      }
    }
    res.push({
      model: 'vcs_PullRequest',
      record: {
        uid: String(pullRequestItem.pullRequestId),
        title: pullRequestItem.title,
        state: this.convertPullRequestState(pullRequestItem.status),
        htmlUrl: pullRequestItem.url,
        createdAt: Utils.toDate(pullRequestItem.creationDate),
        updatedAt: Utils.toDate(pullRequestItem.creationDate),
        mergedAt: Utils.toDate(pullRequestItem.closedDate),
        commitCount: pullRequestItem.commits.length,
        commentCount: pullRequestItem.threads.length,
        diffStats,
        author: {uid: pullRequestItem.createdBy.id, source},
        mergeCommit: {
          sha: pullRequestItem.lastMergeCommit.commitId,
          repository,
        },
        repository,
      },
    });

    for (const reviewer of pullRequestItem.reviewers) {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: reviewer.id,
          htmlUrl: reviewer.url,
          state: this.convertPullRequestReviewState(reviewer.vote),
          submittedAt: null,
          reviewer: {uid: reviewer.id, source},
          pullRequest,
        },
      });
    }

    return res;
  }
}
