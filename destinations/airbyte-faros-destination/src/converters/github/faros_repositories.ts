import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosRepositories extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const repo = record.record.data as Repository & {syncRepoData: boolean};
    const repoKey = GitHubCommon.repoKey(
      repo.org,
      repo.name,
      this.streamName.source
    );
    const res: DestinationRecord[] = [
      {
        model: 'vcs_Repository',
        record: {
          ...repoKey,
          fullName: repo.full_name,
          private: repo.private,
          description: Utils.cleanAndTruncate(repo.description),
          language: repo.language ?? null,
          size: repo.size,
          mainBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          topics: repo.topics?.filter((t) => t),
          createdAt: Utils.toDate(repo?.created_at),
          updatedAt: Utils.toDate(repo?.updated_at),
          archived: repo.archived,
        },
      },
    ];
    if (
      repo.syncRepoData &&
      ctx?.config?.edition_configs?.edition !== Edition.COMMUNITY
    ) {
      res.push({
        model: 'faros_VcsRepositoryOptions',
        record: {
          repository: repoKey,
          inclusion: {category: 'Included'},
        },
      });
    }
    return res;
  }
}
