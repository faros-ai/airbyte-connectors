import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {NotionConverter} from './common';

export class Users extends NotionConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const user = record.record.data;
    const results: DestinationRecord[] = [];
    results.push({
      model: 'tms_User',
      record: {
        source: this.streamName.source,
        uid: user.id,
        email: user.person?.email,
        name: user.name,
      },
    });
    return results;
  }
}
