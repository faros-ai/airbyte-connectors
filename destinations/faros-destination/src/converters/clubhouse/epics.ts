import {Epic} from 'clubhouse-lib';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Epic'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const epic = record.record.data as Epic;
    return [
      {
        model: 'ims_Epic',
        record: {
          uid: epic.id,
          app_url: epic.app_url,
          archived: epic.archived,
          name: epic.name,
          labels: epic.labels,
          entity_type: epic.entity_type,
          description: epic.description,
          source,
        },
      },
    ];
  }
}
