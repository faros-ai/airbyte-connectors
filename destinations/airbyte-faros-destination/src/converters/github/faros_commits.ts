import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosCommits extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Commit'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const commit = record.record.data as Commit;
    const source = this.streamName.source;
    return [];
  }
}
