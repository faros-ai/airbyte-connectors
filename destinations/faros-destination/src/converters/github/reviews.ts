import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubReviews implements Converter {
  readonly streamName = new StreamName('github', 'reviews');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequestReview',
    'vcs_User',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO
    return [];
  }
}
