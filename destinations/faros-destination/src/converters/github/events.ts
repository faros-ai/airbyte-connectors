import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubEvents implements Converter {
  readonly streamName = new StreamName('github', 'events');
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
