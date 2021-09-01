import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubReviewComments implements Converter {
  readonly streamName = new StreamName('github', 'review_comments');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
