import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class GithubIssueEvents extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
