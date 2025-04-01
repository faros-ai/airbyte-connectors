import {ProjectVisibility} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Repository} from 'faros-airbyte-common/azure-devops';

import {getOrganizationFromUrl} from '../common/azure-devops';
import {OrgTypeCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter} from './common';

export class Repositories extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'vcs_Repository',
    'vcs_Branch',
  ];

  private readonly seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repositoryItem = record.record.data as Repository;
    const res: DestinationRecord[] = [];
    const organizationName = getOrganizationFromUrl(repositoryItem.url);
    const organization = {uid: organizationName, source};
    const repository = this.getProjectRepo(repositoryItem, organization);

    if (!this.seenOrganizations.has(organizationName)) {
      this.seenOrganizations.add(organizationName);
      res.push({
        model: 'vcs_Organization',
        record: {
          uid: organizationName,
          name: organizationName,
          htmlUrl: this.getOrganizationUrl(
            repositoryItem.url,
            organizationName
          ),
          type: {category: OrgTypeCategory.Organization, organizationName},
          description: organizationName,
          source,
        },
      });
    }

    res.push({
      model: 'vcs_Repository',
      record: {
        ...repository,
        fullName: repositoryItem.name,
        description: repositoryItem.name,
        private:
          repositoryItem.project?.visibility !== ProjectVisibility.Public,
        size: repositoryItem.size,
        mainBranch: repositoryItem.defaultBranch,
        htmlUrl: repositoryItem.webUrl,
      },
    });

    for (const branch of repositoryItem.branches ?? []) {
      res.push({
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          uid: branch.name,
          repository,
        },
      });
    }

    for (const tag of repositoryItem.tags ?? []) {
      const commitId = tag.commit?.taggedObject?.objectId;

      if (commitId) {
        res.push({
          model: 'vcs_Tag',
          record: {
            name: tag.name,
            message: tag.commit.message,
            commit: {sha: commitId, uid: commitId, repository},
            repository,
          },
        });
      }
    }
    return res;
  }

  private getOrganizationUrl(
    repoUrl: string,
    organizationName: string
  ): string {
    if (!repoUrl) {
      return;
    }
    try {
      const url = new URL(repoUrl);
      return `${url.origin}/${organizationName}`;
    } catch (e) {
      return;
    }
  }
}
