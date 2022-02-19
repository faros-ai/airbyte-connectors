import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzuregitConverter} from './common';
import {OrgTypeCategory, Repository} from './models';

export class AzuregitRepositories extends AzuregitConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_Commit',
    'vcs_BranchCommitAssociation',
    'vcs_Organization',
    'vcs_Repository',
    'vcs_Tag',
  ];

  private seenOrganizations = new Set<string>();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const repositoryItem = record.record.data as Repository;
    const repository = {uid: repositoryItem.id};
    const res: DestinationRecord[] = [];
    const organizationName = this.getOrganizationFromUrl(repositoryItem.url);
    const organization = {uid: organizationName, source};

    if (!this.seenOrganizations.has(organizationName)) {
      this.seenOrganizations.add(organizationName);
      res.push({
        model: 'vcs_Organization',
        record: {
          uid: repositoryItem.id,
          name: organizationName,
          htmlUrl: null,
          type: {category: OrgTypeCategory.Organization, organizationName},
          description: organizationName,
          createdAt: null,
          source,
        },
      });
    }
    res.push({
      model: 'vcs_Repository',
      record: {
        uid: repositoryItem.id,
        name: repositoryItem.name,
        fullName: repositoryItem.name,
        description: repositoryItem.name,
        private: repositoryItem.project.visibility == 'private',
        language: null,
        size: repositoryItem.size,
        mainBranch: repositoryItem.defaultBranch,
        htmlUrl: repositoryItem.webUrl,
        type: {category: OrgTypeCategory.Organization, organizationName},
        createdAt: null,
        updatedAt: null,
        organization,
      },
    });

    for (const branch of repositoryItem.branches) {
      res.push({
        model: 'vcs_Branch',
        record: {
          name: branch.name,
          repository,
        },
      });
      for (const commit of branch.commits) {
        res.push({
          model: 'vcs_Commit',
          record: {
            sha: commit.commitId,
            message: commit.comment,
            htmlUrl: commit.remoteUrl,
            createdAt: Utils.toDate(commit.committer.date),
            author: {uid: commit.author.email, source},
            repository,
          },
        });
        res.push({
          model: 'vcs_BranchCommitAssociation',
          record: {
            commit: {sha: commit.commitId},
            branch: {name: branch.name},
          },
        });
      }
    }
    for (const tag of repositoryItem.tags) {
      res.push({
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          message: tag.commit.message,
          commit: {sha: tag.commit.taggedObject.objectId},
          repository,
        },
      });
    }
    return res;
  }
}
