import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Pipeline} from './common';

export class BuildkitePipelines extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const organization = {uid: pipeline.organization?.slug, source};
    return [
      {
        model: 'cicd_Pipeline',
        record: {
          uid: pipeline.slug,
          name: pipeline.name,
          url: pipeline.url,
          organization,
        },
      },
    ];
  }
}
