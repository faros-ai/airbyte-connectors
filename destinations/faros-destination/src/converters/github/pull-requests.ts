import {AirbyteRecord} from 'cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubPullRequests implements Converter {
  readonly streamName = new StreamName('github', 'pull_requests');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
    'tms_TaskAssignment',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
