import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class ReviewComments extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestComment',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const comment = record.record.data;

    const repository = GitHubCommon.parseRepositoryKey(
      comment.repository,
      source
    );

    if (!repository) return [];

    // Parse the PR number from the pull request url
    const prNum = GitHubCommon.parsePRnumber(comment.pull_request_url);
    const pullRequest = {repository, number: prNum, uid: prNum.toString()};

    const author = comment.user?.login
      ? {uid: comment.user.login, source}
      : null;

    return [
      {
        model: 'vcs_PullRequestComment',
        record: {
          number: comment.id,
          uid: comment.id.toString(),
          comment: Utils.cleanAndTruncate(
            comment?.body,
            GitHubCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(comment.created_at),
          updatedAt: Utils.toDate(comment.updated_at),
          author,
          pullRequest,
        },
      },
    ];
  }
}
