import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {SemaphoreCICommon, SemaphoreCIConverter} from './common';
import {Project} from './models';

export class Projects extends SemaphoreCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'cicd_Repository',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.metadata.id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data as Project;

    const organization = {
      model: 'cicd_Organization',
      record: {
        uid: project.spec.repository.owner,
        name: project.spec.repository.owner,
        url: SemaphoreCICommon.buildOrganizationUrl(
          project.spec.repository.owner
        ),
        source: source,
      },
    };

    const repository = {
      model: 'cicd_Repository',
      record: {
        uid: project.spec.repository.name,
        name: project.spec.repository.name,
        description: project.metadata.description,
        url: SemaphoreCICommon.buildArtifactRepoUrl(
          project.spec.repository.owner,
          project.metadata.id
        ),
        organization: {
          uid: organization.record.uid,
          source,
        },
      },
    };

    return [organization, repository];
  }
}
