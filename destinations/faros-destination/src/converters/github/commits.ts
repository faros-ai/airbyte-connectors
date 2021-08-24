import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubCommits implements Converter {
  readonly streamName = new StreamName('github', 'commits');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_BranchCommitAssociation',
    'vcs_Commit',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
