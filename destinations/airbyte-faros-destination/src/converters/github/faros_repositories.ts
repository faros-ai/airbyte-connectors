import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {Edition} from '../../common/types';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosRepositories extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Repository',
    'compute_Application',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'vcs_Repository',
    'vcs_RepositoryTag',
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
          pushedAt: Utils.toDate(repo?.pushed_at),
          archived: repo.archived,
        },
      },
    ];

    if (repo.languages) {
      for (const {language, bytes} of repo.languages) {
        const tagKey = {
          uid: `githubLanguageBytes__${repo.org}__${repo.name}__${language}`,
        };

        res.push(
          {
            model: 'faros_Tag',
            record: {
              ...tagKey,
              key: `Language__${language}`,
              value: bytes.toString(),
            },
          },
          {
            model: 'vcs_RepositoryTag',
            record: {
              tag: tagKey,
              repository: repoKey,
            },
          }
        );
      }
    }

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

    if (this.cicdEnabled(ctx)) {
      res.push({
        model: 'compute_Application',
        record: {
          name: `${repoKey.organization.uid}/${repoKey.name}`,
          platform: this.streamName.source,
        },
      });

      res.push({
        model: 'cicd_Repository',
        record: {
          ...repoKey,
          description: Utils.cleanAndTruncate(repo.description),
          url: repo.html_url,
        },
      });
    }

    return res;
  }
}
