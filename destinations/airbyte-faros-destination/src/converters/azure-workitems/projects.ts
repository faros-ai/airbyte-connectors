import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureWorkitemsConverter} from './common';
import {Project} from './models';

export class Projects extends AzureWorkitemsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as Project;
    return [
      {
        model: 'tms_Project',
        record: {
          uid: String(project.id),
          name: project.name,
          description: Utils.cleanAndTruncate(project.description),
          updatedAt: Utils.toDate(project.lastUpdateTime),
          source: this.streamName.source,
        },
      },
    ];
  }
}
