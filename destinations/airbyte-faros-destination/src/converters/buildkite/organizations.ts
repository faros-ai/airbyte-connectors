import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Organization} from './common';

export class Organizations extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const organization = record.record.data as Organization;
    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: organization.id,
          name: organization.name,
          slug: organization.slug,
          url: organization.web_url,
          source,
        },
      },
    ];
  }
}
