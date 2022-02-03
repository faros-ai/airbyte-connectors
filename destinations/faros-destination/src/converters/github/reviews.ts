import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {camelCase, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

// GitHub Review States
const ReviewStates = [
  'approved',
  'commented',
  'changes_requested',
  'dismissed',
];

export class GithubReviews extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestReview',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const review = record.record.data;
    const res: DestinationRecord[] = [];
    const repository = GithubCommon.parseRepositoryKey(
      review.repository,
      source
    );

    if (!repository) return [];

    let author: DestinationRecord | undefined = undefined;
    if (review.user) {
      author = GithubCommon.vcs_User(review.user, source);
      res.push(author);
    }

    // Parse the PR number from the pull request url
    const prNum = GithubCommon.parsePRnumber(review.pull_request_url);
    const pullRequest = {repository, number: prNum};

    const state = ReviewStates.includes(review.state.toLowerCase())
      ? {
          category: upperFirst(camelCase(review.state)),
          detail: review.state,
        }
      : {category: 'Custom', detail: review.state};

    res.push({
      model: 'vcs_PullRequestReview',
      record: {
        number: review.id,
        uid: review.id.toString(),
        htmlUrl: review.html_url,
        pullRequest,
        reviewer: author ? {uid: author.record.uid, source} : null,
        state,
        submittedAt: Utils.toDate(review.submitted_at),
      },
    });

    return res;
  }
}
