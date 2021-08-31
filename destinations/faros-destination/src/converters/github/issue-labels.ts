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
    // TODO: convert records
    return [];
  }
}
