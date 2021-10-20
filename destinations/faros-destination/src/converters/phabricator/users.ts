import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorConverter} from './common';

export class PhabricatorUsers extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    // TODO: convert records
    return [];
  }
}
