import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AsanaConverter, ProjectTaskAssociation} from './common';

export class ProjectTasks extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const projectTask: ProjectTaskAssociation = record.record
      .data as ProjectTaskAssociation;
    const taskKey = {uid: projectTask.task_gid, source};
    const res: DestinationRecord[] = [];

    res.push({
      model: 'tms_TaskBoardRelationship',
      record: {
        task: taskKey,
        board: {uid: projectTask.project_gid, source},
      },
    });
    res.push({
      model: 'tms_TaskProjectRelationship',
      record: {
        task: taskKey,
        project: {uid: projectTask.project_gid, source},
      },
    });

    return res;
  }
}
