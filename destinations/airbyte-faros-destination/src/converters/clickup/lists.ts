import {AirbyteRecord} from 'faros-airbyte-cdk';
import {List} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Lists extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const list = record.record.data as List;
    const source = this.streamName.source;
    const uid = list.id;
    const results: DestinationRecord[] = [];
    if (this.taskboardSource(ctx) === 'list') {
      results.push(
        {
          model: 'tms_TaskBoard',
          record: {uid, name: list.name, source},
        },
        {
          model: 'tms_TaskBoardProjectRelationship',
          record: {
            board: {uid, source},
            project: {uid: list.computedProperties.workspace.id, source},
          },
        }
      );
    }
    return results;
  }
}
