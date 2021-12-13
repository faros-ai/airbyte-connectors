import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter} from './common';
import {Branch} from './types';

export class BitbucketBranches extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Branch'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const branch = record.record.data as Branch;

    const [workspace, repo] = branch.target.repository.fullName.split('/');
    if (!workspace || !repo) return [];

    return [
      {
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          repository: {
            organization: {uid: workspace.toLowerCase(), source},
            name: repo.toLowerCase(),
          },
        },
      },
    ];
  }
}
