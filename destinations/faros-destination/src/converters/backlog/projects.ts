import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BacklogCommon, BacklogConverter} from './common';
import {Project} from './models';
export class BacklogProjects extends BacklogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_Release',
    'tms_Sprint',
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
    res.push({
      model: 'tms_Project',
      record: {
        uid,
        name: project.name,
        description: project.name,
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
    for (const versionMilestone of project.versionMilestones) {
      res.push({
        model: 'tms_Sprint',
        record: {
          uid: String(versionMilestone.id),
          name: versionMilestone.name,
          description: versionMilestone.description,
          plannedPoints: 0,
          completedPoints: 0,
          startedAt: Utils.toDate(versionMilestone.startDate),
          endedAt: Utils.toDate(versionMilestone.releaseDueDate),
          state: BacklogCommon.getSprintState(versionMilestone),
          source,
        },
      });
      if (versionMilestone.releaseDueDate) {
        res.push({
          model: 'tms_Release',
          record: {
            uid: String(versionMilestone.id),
            name: versionMilestone.name,
            description: versionMilestone.description,
            startedAt: Utils.toDate(versionMilestone.startDate),
            releasedAt: Utils.toDate(versionMilestone.releaseDueDate),
            source,
          },
        });
      }
    }
    return res;
  }
}
