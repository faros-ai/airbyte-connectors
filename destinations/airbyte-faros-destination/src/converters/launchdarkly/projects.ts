import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyProject} from './common';

export class Projects extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_Project'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project: LaunchDarklyProject = record.record.data as LaunchDarklyProject;

    return [
      {
        model: 'ffs_Project',
        record: {
          id: project.key,
          name: project.name,
          description: project.description || null,
          createdAt: project.creationDate ? new Date(project.creationDate).toISOString() : null,
          source,
        },
      },
    ];
  }
}
