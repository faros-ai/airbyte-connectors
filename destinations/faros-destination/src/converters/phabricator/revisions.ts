import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorConverter} from './common';

export class PhabricatorRevisions extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
