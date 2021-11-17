import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';

export class VictoropsTeams extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Team'];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.slug;
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
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
