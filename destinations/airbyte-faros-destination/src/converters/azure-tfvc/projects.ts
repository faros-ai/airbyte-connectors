import {ProjectVisibility} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {TfvcProject} from 'faros-airbyte-common/azure-devops';

import {OrgTypeCategory, repoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureTfvcConverter} from './common';

export class Projects extends AzureTfvcConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_Repository',
  ];

  private readonly seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const project = record.record.data as TfvcProject;
    const res: DestinationRecord[] = [];

    const repository = repoKey(project.organization, project.name, this.source);
    if (!repository) {
      ctx.logger.warn(
        `Organization or project name not found: ${JSON.stringify(project)}`
      );
      return res;
    }

    if (!this.seenOrganizations.has(repository.organization.uid)) {
      this.seenOrganizations.add(repository.organization.uid);
      res.push({
        model: 'vcs_Organization',
        record: {
          ...repository.organization,
          name: project.organization,
          type: {category: OrgTypeCategory.Organization},
        },
      });
    }

    res.push({
      model: 'vcs_Repository',
      record: {
        ...repository,
        fullName: project.name,
        description: project.description,
        htmlUrl: project.url,
        private: project.visibility === ProjectVisibility.Private,
        updatedAt: project.lastUpdateTime,
      },
    });

    return res;
  }
}
