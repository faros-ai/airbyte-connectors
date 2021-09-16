import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubAssignees extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_User'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const user = record.record.data;

    return [GithubCommon.tms_User(user, source)];
  }
}
