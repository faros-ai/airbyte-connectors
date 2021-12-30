import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Project} from './common';

export class BuildkiteOrganizations extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    return [
      {
        model: 'tms_Project',
        record: {
          uid: project.id,
          name: project.name,
          abbreviation: project.abbreviation,
          color: project.color,
          team_id: project.team_id,
          description: project.description,
          source,
        },
      },
    ];
  }
}
