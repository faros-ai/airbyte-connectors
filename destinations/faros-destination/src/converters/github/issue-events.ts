import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubIssueEvents implements Converter {
  readonly streamName = new StreamName('github', 'issue_events');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
