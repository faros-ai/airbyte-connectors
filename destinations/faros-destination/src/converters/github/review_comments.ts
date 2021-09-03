import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubReviewComments implements Converter {
  readonly streamName = new StreamName('github', 'review_comments');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestComment',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const comment = record.record.data;

    const repository = GithubCommon.parseRepositoryKey(
      comment.repository,
      source
    );

    if (!repository) return [];

    // Parse the PR number from the pull request url
    const prNum = GithubCommon.parsePRnumber(comment.pull_request_url);
    const pullRequest = {repository, number: prNum};

    // TODO: change user uid to login once it's available
    const author = comment.user ? {uid: `${comment.user.id}`, source} : null;

    return [
      {
        model: 'vcs_PullRequestComment',
        record: {
          number: comment.id,
          comment: comment.body,
          createdAt: Utils.toDate(comment.created_at),
          updatedAt: Utils.toDate(comment.updated_at),
          author,
          pullRequest,
        },
      },
    ];
  }
}
