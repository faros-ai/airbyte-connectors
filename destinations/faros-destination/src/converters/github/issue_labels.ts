import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class GithubIssueLabels extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const label = record.record.data;
    return [
      {
        model: 'tms_Label',
        record: {name: label.name},
      },
    ];
  }
}
