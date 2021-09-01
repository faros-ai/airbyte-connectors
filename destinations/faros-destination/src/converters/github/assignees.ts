import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubAssignees implements Converter {
  readonly streamName = new StreamName('github', 'assignees');
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [GithubCommon.tms_User(user, source)];
  }
}
