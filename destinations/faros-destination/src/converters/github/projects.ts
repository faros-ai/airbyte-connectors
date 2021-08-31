import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubProjects implements Converter {
  readonly streamName = new StreamName('github', 'projects');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
