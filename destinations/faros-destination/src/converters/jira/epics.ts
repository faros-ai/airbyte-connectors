import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {JiraConverter} from './common';

export class JiraEpics extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  private static readonly projectsStream = new StreamName('jira', 'projects');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [JiraEpics.projectsStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const epic = record.record.data;
    return [
      {
        model: 'tms_Epic',
        record: {
          uid: epic.key,
          name: epic.fields.summary ?? null,
          description: '',
          source: this.streamName.source,
        },
      },
    ];
  }
}
