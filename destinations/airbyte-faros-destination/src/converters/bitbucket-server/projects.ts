import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Project, selfHRef} from 'faros-airbyte-common/bitbucket-server';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class Projects extends BitbucketServerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as Project;
    return [
      {
        model: 'vcs_Organization',
        record: {
          ...this.vcsOrgKey(project.key),
          name: project.name,
          type: {category: 'Workspace'},
          htmlUrl: selfHRef(project.links),
        },
      },
    ];
  }
}
