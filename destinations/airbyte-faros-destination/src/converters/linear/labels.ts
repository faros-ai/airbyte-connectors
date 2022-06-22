import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearConverter} from './common';
import {Label} from './models';

export class Labels extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const label = record.record.data as Label;
    return [
      {
        model: 'tms_Label',
        record: {
          name: label.name,
        },
      },
    ];
  }
}
