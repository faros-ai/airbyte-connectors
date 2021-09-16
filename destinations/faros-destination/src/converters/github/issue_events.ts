import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubConverter} from './common';

export class GithubIssueEvents extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
