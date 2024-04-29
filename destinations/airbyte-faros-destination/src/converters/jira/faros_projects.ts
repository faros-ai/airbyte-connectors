import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosProjects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data;
    const source = this.streamName.source;
    return [
      {
        model: 'tms_Project',
        record: {
          uid: project.key,
          name: project.name,
          description: this.truncate(ctx, project.description),
          sourceSystemId: project.id,
          source,
        },
      },
    ];
  }
}
