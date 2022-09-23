import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Branches extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const branch = record.record.data;

    const repository = GitHubCommon.parseRepositoryKey(
      branch.repository,
      source
    );

    if (!repository) return [];

    return [
      {
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          uid: branch.name,
          repository,
        },
      },
    ];
  }
}
