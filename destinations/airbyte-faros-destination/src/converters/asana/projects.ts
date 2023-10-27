import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AsanaConverter, AsanaProject} from './common';

export class Projects extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_Project',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project: AsanaProject = record.record.data as AsanaProject;

    const board: DestinationRecord = {
      model: 'tms_TaskBoard',
      record: {
        uid: project.gid,
        name: project.name,
        source,
      },
    };

    const tmsProject: DestinationRecord = {
      model: 'tms_Project',
      ...board,
    };

    const boardProjectRelationship: DestinationRecord = {
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: {uid: project.gid, source},
        project: {uid: project.gid, source},
      },
    };

    return [board, tmsProject, boardProjectRelationship];
  }
}
