import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosRepositories extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const isCommunity =
      ctx?.config?.edition_configs?.edition === Edition.COMMUNITY;
    const repo = record.record.data as Repository;
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
    const writeInclusion = repo.syncRepoData && !isCommunity;
    if (repo.syncRepoData && repo.tmsEnabled) {
      const projectUid = `${repoKey.organization.uid}/${repoKey.name}`;
      res.push(
        ...GitHubCommon.tms_ProjectBoard_with_TaskBoard(
          {
            uid: projectUid,
            source: this.streamName.source,
          },
          projectUid,
          repo.description,
          repo.created_at,
          repo.updated_at,
          writeInclusion
        )
      );
    }
    if (writeInclusion) {
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
