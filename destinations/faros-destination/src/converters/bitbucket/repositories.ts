import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketCommon, BitbucketConverter} from './common';
import {Repository, Workspace} from './types';

export class BitbucketRepositories extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Repository',
  ];

  private readonly workspacesStream = new StreamName('bitbucket', 'workspace');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.workspacesStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
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

    return [
      {
        model: 'cicd_Repository',
        record: {
          uid: repository.slug.toLowerCase(),
          name: repository.name,
          description: repository.description?.substring(
            0,
            BitbucketCommon.MAX_DESCRIPTION_LENGTH
          ),
          url: repository.links.htmlUrl,
          organization: {uid: workspace?.uuid, source},
        },
      },
    ];
  }
}
