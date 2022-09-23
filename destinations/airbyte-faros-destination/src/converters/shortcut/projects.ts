import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {ShortcutConverter} from './common';
import {Project} from './models';
export class Projects extends ShortcutConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
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
