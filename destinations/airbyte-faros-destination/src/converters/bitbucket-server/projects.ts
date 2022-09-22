import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  Project,
  selfHRef,
} from 'faros-airbyte-common/lib/bitbucket-server/types';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BitbucketServerConverter} from './common';

export class Projects extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;

    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: project.key.toLowerCase(),
          name: project.name,
          type: {category: 'Workspace'},
          htmlUrl: selfHRef(project.links),
          source,
        },
      },
    ];
  }
}
