import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Branch} from 'faros-airbyte-common/bitbucket';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketConverter} from './common';

export class Branches extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const branch = record.record.data as Branch;

    const [workspace, repo] = branch.target.repository.fullName.split('/');
    if (!workspace || !repo) return [];

    return [
      {
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          uid: branch.name,
          repository: {
            organization: {uid: workspace.toLowerCase(), source},
            uid: repo.toLowerCase(),
            name: repo.toLowerCase(),
          },
        },
      },
    ];
  }
}
