import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class Projects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data;
    const source = this.initializeSource(ctx);
    const uid = project.key;
    const results: DestinationRecord[] = [];
    results.push({
      model: 'tms_Project',
      record: {
        uid,
        name: project.name,
        description: this.truncate(ctx, project.description),
        source,
      },
    });
    if (this.useProjectsAsBoards(ctx)) {
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
