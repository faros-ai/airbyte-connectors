import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {HarnessConverter, Organization} from './common';

export class Organizations extends HarnessConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const org = record.record.data as Organization;

    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: org.identifier,
          name: org.name,
          description: org.description,
          source,
        },
      },
    ];
  }
}
