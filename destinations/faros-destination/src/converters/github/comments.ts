import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubComments implements Converter {
  readonly streamName = new StreamName('github', 'comments');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestComment',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO
    return [];
  }
}
