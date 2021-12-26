import {Iteration} from 'clubhouse-lib';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Iteration',
  ];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data as Iteration;
    return [
      {
        model: 'ims_Iteration',
        record: {
          uid: project.id,
          name: project.name,
          labels: project.labels,
          end_date: project.end_date,
          entity_type: project.entity_type,
          description: project.description,
          source,
        },
      },
    ];
  }
}
