import {Repository} from 'clubhouse-lib';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Repository',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const repository = record.record.data as Repository;
    return [
      {
        model: 'ims_Repository',
        record: {
          uid: repository.id,
          full_name: repository.full_name,
          name: repository.name,
          type: repository.type,
          url: repository.url,
          source,
        },
      },
    ];
  }
}
