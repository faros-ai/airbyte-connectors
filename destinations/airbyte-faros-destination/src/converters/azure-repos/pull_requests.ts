import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureReposConverter} from './common';
import {PullRequest} from './models';

export class PullRequests extends AzureReposConverter {
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
    const organizationName = this.getOrganizationFromUrl(
      pullRequestItem.repository.url
    );
    const organization = {uid: organizationName, source};
    const repository = {
      name: pullRequestItem.repository.name,
      uid: pullRequestItem.repository.name,
      organization,
    };
    const pullRequest = {
      number: pullRequestItem.pullRequestId,
      uid: pullRequestItem.pullRequestId.toString(),
      repository,
    };

    const res: DestinationRecord[] = [];

    const diffStats = {linesAdded: 0, linesDeleted: 0, filesChanged: 0};

    for (const commit of pullRequestItem.commits) {
      diffStats.linesAdded += commit.changeCounts.Add ?? 0;
      diffStats.linesDeleted += commit.changeCounts.Delete ?? 0;
      diffStats.filesChanged += commit.changeCounts.Edit ?? 0;
    }

    for (const thread of pullRequestItem.threads) {
      for (const comment of thread.comments) {
        res.push({
          model: 'vcs_PullRequestComment',
          record: {
            number: comment.id,
            uid: comment.id.toString(),
            comment: comment.content,
            createdAt: Utils.toDate(comment.publishedDate),
            updatedAt: Utils.toDate(comment.lastUpdatedDate),
            author: {uid: comment.author.uniqueName, source},
            pullRequest,
          },
        });
      }
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
        commitCount: pullRequestItem.commits.length,
        commentCount: pullRequestItem.threads.length,
        diffStats,
        author: {uid: pullRequestItem.createdBy.uniqueName, source},
        mergeCommit: {
          sha: pullRequestItem.lastMergeCommit.commitId,
          uid: pullRequestItem.lastMergeCommit.commitId,
          repository,
        },
        repository,
      },
    });

    for (const reviewer of pullRequestItem.reviewers) {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: this.convertStringToNumber(reviewer.id),
          uid: reviewer.id,
          htmlUrl: reviewer.url,
          state: this.convertPullRequestReviewState(reviewer.vote),
          submittedAt: null,
          reviewer: {uid: reviewer.uniqueName, source},
          pullRequest,
        },
      });
    }

    return res;
  }
}
