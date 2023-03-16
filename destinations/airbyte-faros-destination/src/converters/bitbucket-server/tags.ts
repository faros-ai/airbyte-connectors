import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/bitbucket-server';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class Tags extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const tag = record.record.data as Tag;
    const [project, repo] =
      tag.computedProperties.repository.fullName.split('/');
    const repoRef = this.vcsRepoKey(project, repo);
    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.displayId,
          repository: repoRef,
          commit: {
            repository: repoRef,
            sha: tag.latestCommit,
          },
        },
      },
    ];
  }
}
