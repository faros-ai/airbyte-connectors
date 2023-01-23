import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzureReposConverter} from './common';
import {Commit} from './models';

export class Commits extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Commit',
    'vcs_BranchCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commitItem = record.record.data as Commit;
    const res: DestinationRecord[] = [];
    const organizationName = this.getOrganizationFromUrl(commitItem.url);
    const organization = {uid: organizationName, source};

    if (!commitItem.repository) return res;

    const projectRepo = this.getProjectRepo(commitItem.repository);
    const repository = {
      name: projectRepo,
      uid: projectRepo,
      organization,
    };

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commitItem.commitId,
        uid: commitItem.commitId,
        message: commitItem.comment,
        htmlUrl: commitItem.remoteUrl,
        createdAt: Utils.toDate(commitItem.committer?.date),
        author: {uid: commitItem.author?.email, source},
        repository,
      },
    });
    res.push({
      model: 'vcs_BranchCommitAssociation',
      record: {
        commit: {
          sha: commitItem.commitId,
          uid: commitItem.commitId,
          repository,
        },
        branch: {
          name: commitItem.branch?.name,
          uid: commitItem.branch?.name,
          repository,
        },
      },
    });

    return res;
  }
}
