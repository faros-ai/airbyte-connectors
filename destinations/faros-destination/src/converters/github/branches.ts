import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubBranches implements Converter {
  readonly streamName = new StreamName('github', 'branches');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
