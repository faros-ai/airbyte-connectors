import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubBranches extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const branch = record.record.data;

    const repository = GithubCommon.parseRepositoryKey(
      branch.repository,
      source
    );

    if (!repository) return [];

    return [
      {
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          repository,
        },
      },
    ];
  }
}
