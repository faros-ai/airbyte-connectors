import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosMergeRequestReviewOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class FarosMergeRequestReviews extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestReview',
  ];

  async convert(
    record: AirbyteRecord,
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const review = record.record.data as FarosMergeRequestReviewOutput;

    const repository = {
      name: toLower(review.project_path),
      uid: toLower(review.project_path),
      organization: {
        uid: review.group_id,
        source,
      },
    };

    const pullRequest = {
      number: review.target_iid,
      uid: review.target_iid.toString(),
      repository,
    };

    const reviewer = review.author_username
      ? {uid: review.author_username, source}
      : null;

    const state = this.reviewState(review.action_name);

    return [
      {
        model: 'vcs_PullRequestReview',
        record: {
          number: Number(review.id),
          uid: String(review.id),
          pullRequest,
          reviewer,
          state,
          submittedAt: Utils.toDate(review.created_at),
        },
      },
    ];
  }

  private reviewState(actionName: string): {category: string; detail: string} {
    const detail = actionName?.toLowerCase() || '';
    switch (detail) {
      case 'approved':
        return {category: 'Approved', detail};
      case 'unapproved':
        return {category: 'Dismissed', detail};
      case 'commented':
        return {category: 'Commented', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}