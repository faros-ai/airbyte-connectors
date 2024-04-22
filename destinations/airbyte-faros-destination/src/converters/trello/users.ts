import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {TrelloCommon, TrelloConverter} from './common';
import {User} from './models';

export class Users extends TrelloConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as User;

    return [TrelloCommon.tms_User(user, source)];
  }
}
