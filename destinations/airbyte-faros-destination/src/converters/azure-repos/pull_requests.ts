import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter, MAX_DESCRIPTION_LENGTH} from './common';
import {PullRequest} from './models';

export class PullRequests extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'vcs_PullRequestReview',
    'vcs_PullRequestComment',
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
            author: {uid: comment.author.uniqueName, source},
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
      ? {uid: pullRequestItem.createdBy.uniqueName.toLowerCase(), source}
      : undefined;

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
      const reviewerKey = reviewer?.uniqueName
        ? {uid: reviewer.uniqueName.toLowerCase(), source}
        : undefined;
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: this.convertStringToNumber(reviewer.id),
          uid: reviewer.id,
          htmlUrl: reviewer.url,
          state: this.convertPullRequestReviewState(reviewer.vote),
          submittedAt: null,
          reviewer: reviewerKey,
          pullRequest,
        },
      });
    }

    return res;
  }
}
