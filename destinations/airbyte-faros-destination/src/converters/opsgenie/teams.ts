import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OpsGenieConverter} from './common';
import {Team} from './models';

export class Teams extends OpsGenieConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Team'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const team = record.record.data as Team;

    return [
      {
        model: 'ims_Team',
        record: {
          uid: team.id,
          name: team.name,
          url: team.links.web,
          source,
        },
      },
    ];
  }
}
