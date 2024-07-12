import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Label} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosLabels extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Label'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data as Label;
    return [
      {
        model: 'vcs_Label',
        record: {
          name: label.name,
        },
      },
    ];
  }
}
