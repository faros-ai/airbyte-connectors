import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AsanaCommon, AsanaConverter, AsanaUser} from './common';

export class Users extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as AsanaUser;

    return [AsanaCommon.tms_User(user, source)];
  }
}
