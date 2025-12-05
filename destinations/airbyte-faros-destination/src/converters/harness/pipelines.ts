import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {HarnessConverter, Pipeline} from './common';

export class Pipelines extends HarnessConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;

    return [
      {
        model: 'cicd_Pipeline',
        record: {
          uid: pipeline.identifier,
          name: pipeline.name,
          description: pipeline.description,
          organization: {uid: pipeline.orgIdentifier, source},
        },
      },
    ];
  }
}
