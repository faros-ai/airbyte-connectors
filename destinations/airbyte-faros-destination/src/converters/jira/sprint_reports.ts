import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toString} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class SprintReports extends JiraConverter {
  get destinationModels(): ReadonlyArray<DestinationModel> {
    return ['tms_Sprint'];
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const sprintReport = record.record.data;
    return [
      {
        model: 'tms_Sprint',
        record: {
          uid: toString(sprintReport.id),
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
  }
}
