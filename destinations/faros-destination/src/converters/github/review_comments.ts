import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubReviewComments extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestComment',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
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
