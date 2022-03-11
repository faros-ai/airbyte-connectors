import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class Repositories extends GithubConverter {
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
    const source = this.streamName.source;
    const repo = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GithubCommon.parseRepositoryKey(repo.full_name, source);
    if (!repository) return res;

    // Create a TMS Project/Board per repo that we sync
    res.push(
      ...GithubCommon.tms_ProjectBoard_with_TaskBoard(
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
      },
    });

    return res;
  }
}
