import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubCommitComments implements Converter {
  readonly streamName = new StreamName('github', 'commit_comments');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
