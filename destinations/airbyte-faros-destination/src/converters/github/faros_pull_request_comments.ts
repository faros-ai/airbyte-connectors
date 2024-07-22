import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {ReviewComments as CommunityPullRequestComments} from './review_comments';
export class FarosPullRequestComments extends GitHubConverter {
  private alias = new CommunityPullRequestComments();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record);
  }
}
