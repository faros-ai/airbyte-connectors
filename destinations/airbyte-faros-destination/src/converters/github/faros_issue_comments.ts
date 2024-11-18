import {AirbyteRecord} from 'faros-airbyte-cdk';
import {IssueComment} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {ReviewComments as CommunityPullRequestComments} from './review_comments';

export class FarosIssueComments extends GitHubConverter {
  private alias = new CommunityPullRequestComments();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const comment = record.record.data as IssueComment;
    // skip issue comments that were not made on a pull request
    if (comment.html_url.split('/').reverse()[1] !== 'pull') {
      return [];
    }
    this.collectUser(comment.user);
    record.record.data = {
      ...comment,
      pull_request_url: comment.issue_url,
    };
    return this.alias.convert(record);
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
