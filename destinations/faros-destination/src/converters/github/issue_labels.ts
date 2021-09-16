import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubConverter} from './common';

export class GithubIssueLabels extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const label = record.record.data;
    return [
      {
        model: 'tms_Label',
        record: {name: label.name},
      },
    ];
  }
}
