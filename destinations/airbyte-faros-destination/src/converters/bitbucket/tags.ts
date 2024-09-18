import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/bitbucket';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';

export class Tags extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data as Tag;

    const sha = tag.target?.hash;
    if (!sha) {
      return [];
    }

    const [workspace, repo] = tag.repository.fullName.split('/');

    if (!workspace || !repo) {
      return [];
    }

    const repository = BitbucketCommon.vcs_Repository(workspace, repo, source);
    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          message: tag.message,
          commit: {sha, uid: sha, repository},
          repository,
        },
      },
    ];
  }
}
