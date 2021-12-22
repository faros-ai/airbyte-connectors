import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Pipeline} from './common';

export class BuildkitePipelines extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_Pipeline',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    return [
      {
        model: 'ims_Pipeline',
        record: {
          id: pipeline.id,
          uid: pipeline.uuid,
          name: pipeline.name,
          slug: pipeline.slug,
          url: pipeline.url,
          description: pipeline.description,
          repo: pipeline.repository?.provider?.name,
          source,
        },
      },
    ];
  }
}
