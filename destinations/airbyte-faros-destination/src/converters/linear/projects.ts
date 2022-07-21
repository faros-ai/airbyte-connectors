import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {LinearCommon, LinearConverter} from './common';
import {Project} from './models';

export class Projects extends LinearConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Epic',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;
    const uid = String(project.id);
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

    res.push({
      model: 'tms_Epic',
      record: {
        uid,
        name: project.name,
        description: project.description?.substring(0, maxDescriptionLength),
        status: {
          category: LinearCommon.getEpicStatus(project.completedAt),
        },
        project: {
          uid,
          source,
        },
        source,
      },
    });
    res.push({
      model: 'tms_Project',
      record: {
        uid,
        name: project.name,
        description: project.description?.substring(0, maxDescriptionLength),
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
