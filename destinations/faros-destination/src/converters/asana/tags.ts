import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaConverter} from './common';

export class AsanaTags extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Label'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const tag = record.record.data;

    return [
      {
        model: 'tms_Label',
        record: {
          name: tag.name,
        },
      },
    ];
  }
}
