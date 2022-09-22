import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  Repository,
  selfHRef,
} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {BitbucketCommon} from '../bitbucket/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerConverter} from './common';

export class Repositories extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repo = record.record.data as Repository;
    const slug = repo.slug.toLowerCase();
    return [
      {
        model: 'vcs_Repository',
        record: {
          uid: slug,
          name: slug,
          organization: {uid: repo.project.key.toLowerCase(), source},
          fullName: repo.computedProperties.fullName.toLowerCase(),
          description: repo.description?.substring(
            0,
            BitbucketCommon.MAX_DESCRIPTION_LENGTH
          ),
          private: !repo.public,
          htmlUrl: selfHRef(repo.links),
          mainBranch: repo.computedProperties.mainBranch,
        },
      },
    ];
  }
}
