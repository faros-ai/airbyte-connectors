import {ChangeCountDictionary} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {getOrganization} from '../common/azure-devops';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureReposConverter, MAX_DESCRIPTION_LENGTH} from './common';

export class Commits extends AzureReposConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Commit',
    'vcs_BranchCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const commitItem = record.record.data as Commit;
    const res: DestinationRecord[] = [];
    const organizationName = getOrganization(ctx, commitItem.url);
    const organization = this.getOrgKey(organizationName);

    if (!commitItem.repository) {
      ctx.logger.error('No repository found for commit', commitItem.commitId);
      return res;
    }
    const repository = this.getProjectRepo(commitItem.repository, organization);

    const author = commitItem.author?.email
      ? {uid: commitItem.author.email.toLowerCase(), source}
      : undefined;

    res.push({
      model: 'vcs_Commit',
      record: {
        sha: commitItem.commitId,
        uid: commitItem.commitId,
        message: Utils.cleanAndTruncate(
          commitItem.comment,
          MAX_DESCRIPTION_LENGTH
        ),
        htmlUrl: commitItem.remoteUrl,
        createdAt: Utils.toDate(commitItem.committer?.date),
        author,
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
          name: commitItem.branch,
          uid: commitItem.branch,
          repository,
        },
      },
    });

    const totalChangeCount = getTotalChangeCount(commitItem.changeCounts);
    if (totalChangeCount !== undefined) {
      this.commitChangeCounts[commitItem.commitId] = totalChangeCount;
    }

    return res;
  }
}

function getTotalChangeCount(
  changeCounts?: ChangeCountDictionary
): number | undefined {
  if (!changeCounts) {
    return undefined;
  }
  return (
    (changeCounts['Add'] ?? 0) +
    (changeCounts['Edit'] ?? 0) +
    (changeCounts['Delete'] ?? 0)
  );
}
