import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {Tags as CommunityTags} from './tags';

export class FarosTags extends GitHubConverter {
  private alias = new CommunityTags();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record);
  }
}
