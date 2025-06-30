import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGroupOutput} from 'faros-airbyte-common/gitlab';

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
    const group = record.record.data as FarosGroupOutput;
    
    // Create a modified record with string conversion of group.id
    const modifiedRecord: AirbyteRecord = {
      ...record,
      record: {
        ...record.record,
        data: {
          ...group,
          id: String(group.id),
        },
      },
    };
    
    return this.alias.convert(modifiedRecord);
  }
}
