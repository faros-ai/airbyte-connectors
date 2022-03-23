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
  ];

  private readonly workspacesStream = new StreamName('bitbucket', 'workspace');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.workspacesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repository = record.record.data as Repository;

    const workspacesStream = this.workspacesStream.asString;
    const workspacesRecord = ctx.get(
      workspacesStream,
      repository.workspace.uuid
    );
    const workspace = workspacesRecord?.record?.data as undefined | Workspace;
    if (!workspace) {
      return [];
    }

    const description = repository.description?.substring(
      0,
      BitbucketCommon.MAX_DESCRIPTION_LENGTH
    );
    return [
      {
        model: 'cicd_Repository',
        record: {
          uid: repository.slug.toLowerCase(),
          name: repository.name,
          description,
          url: repository?.links?.htmlUrl,
          organization: {uid: workspace?.uuid, source},
        },
      },
      {
        model: 'vcs_Repository',
        record: {
          name: repository.slug.toLowerCase(),
          fullName: repository.name,
          description,
          private: repository.isPrivate,
          language: repository.language ?? null,
          size: BigInt(repository.size),
          htmlUrl: repository?.links?.htmlUrl,
          createdAt: Utils.toDate(repository.createdOn),
          updatedAt: Utils.toDate(repository.updatedOn),
          mainBranch: repository.mainBranch?.name,
          organization: {uid: workspace?.uuid, source},
        },
      },
    ];
  }
}
