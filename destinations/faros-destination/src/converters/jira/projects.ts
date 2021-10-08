import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class JiraProjects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const project = record.record.data;
    const source = this.streamName.source;
    const uid = project.key;
    const results: DestinationRecord[] = [];
    results.push({
      model: 'tms_Project',
      record: {
        uid,
        name: project.name,
        description: project.description,
        source,
      },
    });
    if (!this.useBoardOwnership) {
      results.push(
        {
          model: 'tms_TaskBoard',
          record: {uid, name: project.name, source},
        },
        {
          model: 'tms_TaskBoardProjectRelationship',
          record: {board: {uid, source}, project: {uid, source}},
        }
      );
    }
    return results;
  }
}
