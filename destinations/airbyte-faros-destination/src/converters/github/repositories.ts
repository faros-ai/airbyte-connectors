import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class Repositories extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repo = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitHubCommon.parseRepositoryKey(repo.full_name, source);
    if (!repository) return res;

    // Create a TMS Project/Board per repo that we sync
    res.push(
      ...GitHubCommon.tms_ProjectBoard_with_TaskBoard(
        {uid: repo.name, source},
        repo.name,
        repo.description,
        repo.created_at,
        repo.updated_at
      )
    );

    res.push({
      model: 'vcs_Repository',
      record: {
        ...repository,
        fullName: repo.full_name,
        private: repo.private,
        description: repo.description,
        language: repo.language ?? null,
        size: repo.size,
        mainBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        createdAt: Utils.toDate(repo?.created_at),
        updatedAt: Utils.toDate(repo?.updated_at),
        archived: repo.archived,
      },
    });

    return res;
  }
}
