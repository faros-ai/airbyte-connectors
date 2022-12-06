import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {camelCase, upperFirst} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

// GitHub Review States
const ReviewStates = [
  'approved',
  'commented',
  'changes_requested',
  'dismissed',
];

export class Reviews extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestReview',
    'vcs_User',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const review = record.record.data;
    const res: DestinationRecord[] = [];
    const repository = GitHubCommon.parseRepositoryKey(
      review.repository,
      source
    );

    if (!repository) return [];

    let author: DestinationRecord | undefined = undefined;
    if (review.user) {
      author = GitHubCommon.vcs_User(review.user, source);
      if (author) {
        res.push(author);
      }
    }

    // Parse the PR number from the pull request url
    const prNum = GitHubCommon.parsePRnumber(review.pull_request_url);
    const pullRequest = {repository, number: prNum, uid: prNum.toString()};

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
