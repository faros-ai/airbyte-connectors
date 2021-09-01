import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubPullRequestStats implements Converter {
  readonly streamName = new StreamName('github', 'pull_request_stats');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
