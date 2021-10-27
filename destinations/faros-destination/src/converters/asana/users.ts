import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter, AsanaUser} from './common';

export class AsanaUsers extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data as AsanaUser;

    return [AsanaCommon.tms_User(user, source)];
  }
}
