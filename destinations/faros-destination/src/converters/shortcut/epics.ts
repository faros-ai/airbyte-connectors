import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Epic, ShortcutCommon,ShortcutConverter} from './common';

export class ShortcutEpics extends ShortcutConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const epic = record.record.data as Epic;
    return [
      {
        model: 'tms_Epic',
        record: {
          uid: String(epic.id),
          name: epic.name,
          description: epic.description,
          status: {
            category: ShortcutCommon.getEpicStatus(epic.state),
          },
          source,
        },
      },
    ];
  }
}
