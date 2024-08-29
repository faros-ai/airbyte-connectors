import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosRepositories extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const repo = record.record.data as Repository;
    return [
      {
        model: 'vcs_Repository',
        record: {
          name: toLower(repo.name),
          organization: {
            uid: toLower(repo.org),
            source: this.streamName.source,
          },
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
  }
}
