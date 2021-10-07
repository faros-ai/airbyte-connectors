import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';

export class JiraProjects extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const project = record.record.data;
    return [
      {
        model: 'tms_Project',
        record: {
          uid: project.key,
          name: project.name,
          description: project.description,
          source: this.streamName.source,
        },
      },
    ];
  }
}
