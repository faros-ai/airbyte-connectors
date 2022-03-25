import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {Repository, Workspace} from './types';

export class Repositories extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Repository',
    'vcs_Repository',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repository = record.record.data as Repository;
    const workspace = repository.workspace;
    const res: DestinationRecord[] = [];
    const description = repository.description?.substring(
      0,
      BitbucketCommon.MAX_DESCRIPTION_LENGTH
    );
    // Create a TMS Project/Board per repo that we sync
    res.push(
      ...BitbucketCommon.tms_ProjectBoard_with_TaskBoard(
        {uid: repository.name, source},
        repository.name,
        repository.description,
        repository.createdOn,
        repository.updatedOn
      )
    );

    res.push({
      model: 'cicd_Repository',
      record: {
        uid: repository.slug.toLowerCase(),
        name: repository.fullName,
        description,
        url: repository?.links?.htmlUrl,
        organization: {uid: workspace.uuid, source},
      },
    });
    res.push({
      model: 'vcs_Repository',
      record: {
        name: repository.slug.toLowerCase(),
        fullName: repository.fullName,
        description,
        private: repository.isPrivate,
        language: repository.language ?? null,
        size: BigInt(repository.size),
        htmlUrl: repository?.links?.htmlUrl,
        createdAt: Utils.toDate(repository.createdOn),
        updatedAt: Utils.toDate(repository.updatedOn),
        mainBranch: repository.mainBranch?.name,
        organization: {uid: workspace.uuid, source},
      },
    });

    return res;
  }
}
