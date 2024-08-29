import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketConverter} from './common';

export class Repositories extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repository = record.record.data as Repository;
    return [
      {
        model: 'vcs_Repository',
        record: {
          uid: toLower(repository.slug),
          name: toLower(repository.slug),
          fullName: repository.fullName,
          description: Utils.cleanAndTruncate(
            repository.description,
            this.maxDescriptionLength(ctx)
          ),
          private: repository.isPrivate,
          language: repository.language,
          size: repository.size,
          htmlUrl: repository.htmlUrl,
          createdAt: Utils.toDate(repository.createdOn),
          updatedAt: Utils.toDate(repository.updatedOn),
          mainBranch: repository.mainBranch,
          organization: {uid: repository.workspace, source},
        },
      },
    ];
  }
}
