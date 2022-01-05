import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Project} from './common';

export class ClubhouseProjects extends ClubhouseConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    const uid = String(project.id);
    const res: DestinationRecord[] = [];
    res.push({
      model: 'tms_Project',
      record: {
        uid,
        name: project.name,
        description: project.description,
        source,
      },
    });
    res.push({
      model: 'tms_TaskBoard',
      record: {
        uid,
        name: project.name,
        source,
      },
    });
    res.push({
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: {uid, source},
        project: {uid, source},
      },
    });
    return res;
  }
}
