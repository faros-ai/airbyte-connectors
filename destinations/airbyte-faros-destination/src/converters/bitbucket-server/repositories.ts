import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository, selfHRef} from 'faros-airbyte-common/bitbucket-server';

import {BitbucketCommon} from '../bitbucket/common';
import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class Repositories extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const repo = record.record.data as Repository;
    const slug = repo.slug.toLowerCase();
    const repoRef = this.vcsRepoKey(repo.project.key, slug);

    return [
      {
        model: 'vcs_Repository',
        record: {
          ...repoRef,
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
