import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosProjects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data;
    const source = this.initializeSource(ctx);
    return [
      {
        model: 'tms_Project',
        record: {
          uid: project.key,
          name: project.name,
          description: Utils.cleanAndTruncate(
            project.description,
            this.truncateLimit(ctx)
          ),
          sourceSystemId: project.id,
          source,
        },
      },
    ];
  }
}
