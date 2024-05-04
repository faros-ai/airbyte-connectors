import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class FarosSprintReports extends JiraConverter {
  get destinationModels(): ReadonlyArray<DestinationModel> {
    return ['tms_Sprint', 'tms_SprintHistory'];
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprintReport = record.record.data;
    const uid = toString(sprintReport.id);
    const results: DestinationRecord[] = [
      {
        model: 'tms_Sprint',
        record: {
          uid,
          completedPoints: sprintReport.completedPoints,
          completedOutsideSprintPoints:
            sprintReport.completedInAnotherSprintPoints,
          notCompletedPoints: sprintReport.notCompletedPoints,
          removedPoints: sprintReport.puntedPoints,
          plannedPoints: sprintReport.plannedPoints,
          source: this.streamName.source,
        },
      },
    ];
    for (const issue of sprintReport.issues || []) {
      results.push({
        model: 'tms_SprintHistory',
        record: {
          sprint: {uid, source: this.streamName.source},
          issue: {uid: issue.key, source: this.streamName.source},
          points: issue.points,
          status: {category: issue.status},
          addedDuringSprint: issue.addedDuringSprint,
        },
      });
    }
    return results;
  }
}
