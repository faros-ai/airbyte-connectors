import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Folder} from 'faros-airbyte-common/clickup';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClickUpConverter} from './common';

export class Folders extends ClickUpConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const folder = record.record.data as Folder;
    const source = this.streamName.source;
    const uid = folder.id;
    const results: DestinationRecord[] = [];
    if (this.taskboardSource(ctx) === 'folder') {
      results.push(
        {
          model: 'tms_TaskBoard',
          record: {uid, name: folder.name, source},
        },
        {
          model: 'tms_TaskBoardProjectRelationship',
          record: {
            board: {uid, source},
            project: {uid: folder.computedProperties.workspace.id, source},
          },
        }
      );
    }
    return results;
  }
}
