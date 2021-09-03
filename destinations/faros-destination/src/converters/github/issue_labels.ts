import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubIssueLabels implements Converter {
  readonly streamName = new StreamName('github', 'issue_labels');
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
