import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Epic} from './common';

export class ClubhouseEpics extends ClubhouseConverter {
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
            category: this.getEpicStatus(epic.state),
          },
          // TODO: epics and projects relation should be changed to N:N
          project: undefined,
          source,
        },
      },
    ];
  }

  getEpicStatus(status: string): string {
    switch (status) {
      case 'done':
        return 'Done';
      case 'in progress':
        return 'InProgress';
      default:
        return 'Todo';
    }
  }
}
