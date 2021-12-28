import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Organization} from './common';

export class BuildkiteOrganizations extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const organization = record.record.data as Organization;
    return [
      {
        model: 'cicd_Organization',
        record: {
          uid: organization.id,
          name: organization.name,
          slug: organization.slug,
          web_url: organization.web_url,
          source,
        },
      },
    ];
  }
}
