import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter} from './common';
import {OrgTypeCategory, Repository} from './models';

export class Repositories extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_Tag',
    'vcs_Organization',
    'vcs_Repository',
    'vcs_RepositoryTag',
    'vcs_Branch',
    'vcs_Tag',
  ];

  private readonly seenOrganizations = new Set<string>();
  private readonly seenProjects = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repositoryItem = record.record.data as Repository;
    const res: DestinationRecord[] = [];
    const organizationName = this.getOrganizationFromUrl(repositoryItem.url);
    const organization = {uid: organizationName, source};
    const projectRepo = this.getProjectRepo(repositoryItem);
    const repository = {
      name: projectRepo,
      uid: projectRepo,
      organization,
    };
    if (!this.seenOrganizations.has(organizationName)) {
      this.seenOrganizations.add(organizationName);
      res.push({
        model: 'vcs_Organization',
        record: {
          uid: organizationName,
          name: organizationName,
          htmlUrl: `https://dev.azure.com/${organizationName}`,
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
        private: repositoryItem.project.visibility == 'private',
        size: repositoryItem.size,
        mainBranch: repositoryItem.defaultBranch,
        htmlUrl: repositoryItem.webUrl,
      },
    });

    const projectNameTagUid = `ADO_ProjectName_${repositoryItem.project.name}`;
    const projectNameTagKey = {
      uid: projectNameTagUid,
    };
    if (!this.seenProjects.has(projectNameTagUid)) {
      this.seenProjects.add(projectNameTagUid);
      res.push({
        model: 'faros_Tag',
        record: {
          ...projectNameTagKey,
          key: 'ProjectName',
          value: repositoryItem.project.name,
        },
      });
    }
    res.push({
      model: 'vcs_RepositoryTag',
      record: {
        repository,
        tag: projectNameTagKey,
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
}
