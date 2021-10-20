import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';

export class PhabricatorCommits extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = []; // TODO: set destination model

  id(record: AirbyteRecord): any {
    return record?.record?.data?.fields?.identifier;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
