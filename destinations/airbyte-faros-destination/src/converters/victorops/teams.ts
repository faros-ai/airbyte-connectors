import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {VictorOpsConverter} from './common';

export class Teams extends VictorOpsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Team'];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.slug;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const team = record.record.data;

    return [
      {
        model: 'ims_Team',
        record: {
          uid: team.slug,
          name: team.name,
          url: team._selfUrl,
          source,
        },
      },
    ];
  }
}
