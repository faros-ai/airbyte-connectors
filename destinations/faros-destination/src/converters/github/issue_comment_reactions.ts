import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, DestinationModel, DestinationRecord} from '../converter';

export class GithubIssueCommentReactions extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
