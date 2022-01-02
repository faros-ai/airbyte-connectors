import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClubhouseConverter, Epic} from './common';

export class BuildkiteEpics extends ClubhouseConverter {
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
          uid: epic.id,
          name: epic.name,
          description: epic.description,
          project: {uid: epic.project_ids[0], source},
          status: this.epicStatus(epic.state),
          source,
        },
      },
    ];
  }

  private epicStatus(state: string): {category: string; detail: string} {
    switch (state) {
      case 'open':
        return {category: 'InProgress', detail: state};
      case 'closed':
        return {category: 'Done', detail: state};
      default:
        return {category: 'Custom', detail: state};
    }
  }
}
