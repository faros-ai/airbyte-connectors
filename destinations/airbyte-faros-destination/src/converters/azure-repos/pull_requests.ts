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
    'vcs_PullRequestCommit',
    'tms_TaskPullRequestAssociation',
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
            uid: thread.id + '/' + comment.id.toString(),
            comment: comment.content?.substring(0, MAX_DESCRIPTION_LENGTH),
            createdAt: Utils.toDate(comment.publishedDate),
            updatedAt: Utils.toDate(comment.lastUpdatedDate),
            author: {uid: comment.author.uniqueName, source},
            pullRequest,
          },
        });
      }
    }

    for (const commit of pullRequestItem.commits ?? []) {
      res.push({
        model: 'vcs_PullRequestCommit',
        record: {
          commit: {
            uid: commit.commitId.toString(),
          },
          pullRequest,
        },
      });
    }

    for (const workItem of pullRequestItem.workItems ?? []) {
      res.push({
        model: 'tms_TaskPullRequestAssociation',
        record: {
          task: {
            uid: workItem.id.toString(),
            organization,
          },
          pullRequest,
        },
      });
    }

    const mergeCommitId = pullRequestItem.lastMergeCommit?.commitId;
    const mergeCommit = mergeCommitId
      ? {
          repository,
          sha: mergeCommitId,
          uid: mergeCommitId,
        }
      : null;

    res.push({
      model: 'vcs_PullRequest',
      record: {
        number: pullRequestItem.pullRequestId,
        uid: pullRequestItem.pullRequestId.toString(),
        title: pullRequestItem.title,
        state: this.convertPullRequestState(pullRequestItem.status),
        htmlUrl: pullRequestItem.url,
        url: pullRequestItem.url,
        createdAt: Utils.toDate(pullRequestItem.creationDate),
        updatedAt: Utils.toDate(pullRequestItem.creationDate),
        mergedAt: Utils.toDate(pullRequestItem.closedDate),
        commentCount: pullRequestItem.threads.length,
        author: {uid: pullRequestItem.createdBy.uniqueName, source},
        mergeCommit,
        repository,
      },
    });

    for (const reviewer of pullRequestItem.reviewers ?? []) {
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
