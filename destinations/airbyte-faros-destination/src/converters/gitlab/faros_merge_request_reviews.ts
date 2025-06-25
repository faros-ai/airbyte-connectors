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
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const review = record.record.data as FarosMergeRequestReviewOutput;

    const repository = {
      name: toLower(review.project_path),
      uid: toLower(review.project_path),
      organization: {
        uid: toLower(review.group_id),
        source,
      },
    };

    const pullRequest = {
      repository,
      number: review.target_iid,
      uid: review.target_iid.toString(),
    };

    const reviewer = review.author_username
      ? {uid: review.author_username, source}
      : null;

    // GitLab merge request reviews only have 'approved' action
    const state = {category: 'Approved', detail: review.action_name};

    return [
      {
        model: 'vcs_PullRequestReview',
        record: {
          number: review.id,
          uid: review.id.toString(),
          state,
          submittedAt: Utils.toDate(review.created_at),
          reviewer,
          pullRequest,
          htmlUrl: null,
        },
      },
    ];
  }
}
