import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

// Required as dependency by Issues converter
export class JiraPullRequests extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
