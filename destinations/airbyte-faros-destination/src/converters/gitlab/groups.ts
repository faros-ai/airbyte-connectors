import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';
import {FarosGroups} from './faros_groups';

export class Groups extends GitlabConverter {
  private readonly alias = new FarosGroups();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record);
  }
}
