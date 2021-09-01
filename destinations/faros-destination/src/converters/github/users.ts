import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubUsers implements Converter {
  readonly streamName = new StreamName('github', 'users');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Membership',
    'vcs_User',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;
    return GithubCommon.vcs_User_with_Membership(user, source);
  }
}
