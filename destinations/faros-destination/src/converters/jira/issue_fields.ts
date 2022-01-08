import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

// Required as dependency by Issues and Sprints stream
export class JiraIssueFields extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    return [];
  }
}
