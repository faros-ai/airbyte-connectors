import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  isPullRequestComment,
  isPullRequestMerge,
  isPullRequestReview,
  PullRequestActivity,
} from 'faros-airbyte-common/bitbucket-server';
import {Utils} from 'faros-js-client';

import {MAX_DESCRIPTION_LENGTH} from '../azure-repos/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class PullRequestActivities extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestComment',
    'vcs_PullRequestReview',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const activity = record.record.data as PullRequestActivity;
    const {record: user, ref: author} = this.vcsUser(activity.user);

    if (!user) return res;

    const [project, repo] =
      activity.computedProperties.pullRequest.repository.fullName.split('/');
    const id = activity.id;
    const pullRequestId = activity.computedProperties.pullRequest.id;
    const pullRequest = {
      number: pullRequestId,
      uid: pullRequestId.toString(),
      repository: this.vcsRepoKey(project, repo),
    };

    if (isPullRequestComment(activity) && activity.comment?.text) {
      res.push({
        model: 'vcs_PullRequestComment',
        record: {
          number: id,
          uid: id.toString(),
          pullRequest,
          comment: Utils.cleanAndTruncate(
            activity?.comment?.text,
            MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(activity.comment.createdDate),
          updatedAt: Utils.toDate(activity.comment.updatedDate),
          author,
        },
      });
    } else if (isPullRequestMerge(activity)) {
      res.push({
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: pullRequest,
          mask: ['mergeCommit', 'mergedAt'],
          patch: {
            mergeCommit: activity.commit?.id
              ? {
                  sha: activity.commit.id,
                  uid: activity.commit.id,
                  repository: pullRequest.repository,
                }
              : undefined,
            mergedAt: Utils.toDate(activity.createdDate),
          },
        },
      });
    } else if (isPullRequestReview(activity)) {
      res.push({
        model: 'vcs_PullRequestReview',
        record: {
          number: id,
          uid: id.toString(),
          pullRequest,
          reviewer: author,
          state: reviewState(activity.action),
          submittedAt: Utils.toDate(activity.createdDate),
        },
      });
    }

    return res;
  }
}

function reviewState(action: string): {category: string} | undefined {
  if (action === 'APPROVED') return {category: 'Approved'};
  if (action === 'DECLINED') return {category: 'Dismissed'};
  return {category: 'Commented'};
}
