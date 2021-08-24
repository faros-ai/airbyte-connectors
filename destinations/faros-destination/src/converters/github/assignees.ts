import {AirbyteRecord} from 'cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';

export class GithubAssignees implements Converter {
  readonly streamName = new StreamName('github', 'assignees');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [
      {
        model: 'tms_User',
        record: {
          uid: user.login,
          name: user.name,
          source,
        },
      },
    ];
  }
}
