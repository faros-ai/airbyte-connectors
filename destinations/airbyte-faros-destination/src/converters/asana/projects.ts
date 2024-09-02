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

    return Projects.convertProject(
      {gid: project.gid, name: project.name},
      source
    );
  }

  static convertProject(
    project: Pick<AsanaProject, 'gid' | 'name'>,
    source: string
  ): DestinationRecord[] {
    // Since Asana doesn't have a concept of a board, we create a board and a project from the same Asana project.
    // This is the same behavior as the Jira connector when using project ownership.
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
      record: board.record,
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
