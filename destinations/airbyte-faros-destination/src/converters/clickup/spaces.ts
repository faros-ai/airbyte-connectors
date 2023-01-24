import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Space} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Spaces extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const space = record.record.data as Space;
    const source = this.streamName.source;
    const uid = space.id;
    const results: DestinationRecord[] = [];
    if (this.taskboardSource(ctx) === 'space') {
      results.push(
        {
          model: 'tms_TaskBoard',
          record: {uid, name: space.name, source},
        },
        {
          model: 'tms_TaskBoardProjectRelationship',
          record: {
            board: {uid, source},
            project: {uid: space.computedProperties.workspace.id, source},
          },
        }
      );
    }
    return results;
  }
}
