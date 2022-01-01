import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Iteration} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Iteration',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const iteration = record.record.data as Iteration;
    return [
      {
        model: 'tms_Iteration',
        record: {
          uid: iteration.id,
          name: iteration.name,
          labels: iteration.labels,
          end_date: iteration.end_date,
          entity_type: iteration.entity_type,
          description: iteration.description,
          source,
        },
      },
    ];
  }
}
