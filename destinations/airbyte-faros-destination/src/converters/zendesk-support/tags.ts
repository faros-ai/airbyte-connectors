import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {ZendeskSupportConverter} from './common';

export class Tags extends ZendeskSupportConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const name = record.record.data?.name;
    if (!name) {
      return;
    }
    return [
      {
        model: 'tms_Label',
        record: {name},
      },
    ];
  }
}
