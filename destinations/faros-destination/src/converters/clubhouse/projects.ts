import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Project} from './common';

export class BuildkiteProjects extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;

    const project = record.record.data as Project;
    const createdAt = Utils.toDate(project.created_at);
    const updatedAt = Utils.toDate(project.updated_at);
    return [
      {
        model: 'tms_Project',
        record: {
          uid: project.id,
          name: project.name,
          description: project.description,
          createdAt,
          updatedAt,
          source,
        },
      },
    ];
  }
}
