import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Changeset} from 'faros-airbyte-common/azure-devops';
import {Utils} from 'faros-js-client';

import {
  BranchCollector,
  CommitKey,
  FileCollector,
  repoKey,
  VcsDiffStats,
} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureTfvcConverter, MAX_DESCRIPTION_LENGTH} from './common';

// TODO: Add tms_TaskCommitAssociation support

export class Changesets extends AzureTfvcConverter {
  private readonly branchCollector = new BranchCollector();
  private readonly fileCollector = new FileCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Branch',
    'vcs_Commit',
    'vcs_BranchCommitAssociation',
    'vcs_File',
  ];

  id(record: AirbyteRecord): number {
    return record?.record?.data?.changesetId;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const changeset = record.record.data as Changeset;
    const res: DestinationRecord[] = [];

    if (!changeset.changesetId || !changeset.project?.name) {
      ctx.logger.warn(
        `Changeset ID or project name not found: ${JSON.stringify(changeset)}`
      );
      return res;
    }

    const repository = repoKey(
      changeset.organization,
      changeset.project.name,
      this.source
    );

    const sha = String(changeset.changesetId);
    const commit: CommitKey = {sha, repository};
    const author = changeset.author?.uniqueName
      ? {uid: changeset.author.uniqueName.toLowerCase(), source: this.source}
      : undefined;

    res.push({
      model: 'vcs_Commit',
      record: {
        ...commit,
        uid: sha,
        message: Utils.cleanAndTruncate(
          changeset.comment,
          MAX_DESCRIPTION_LENGTH
        ),
        htmlUrl: changeset.url,
        createdAt: Utils.toDate(changeset.createdDate),
        author,
        diffStats: this.getDiffStats(changeset),
      },
    });

    const branch = this.branchCollector.collectBranch(
      changeset.branch,
      repository
    );
    if (branch) {
      res.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit,
          branch,
        },
      });
    }

    // Collect files from changes
    for (const change of changeset.changes ?? []) {
      if (change.item?.path) {
        this.fileCollector.collectFile(change.item.path, repository);
      }
    }

    return res;
  }

  private getDiffStats(changeset: Changeset): VcsDiffStats | undefined {
    if (!changeset.changes?.length) {
      return undefined;
    }
    return {
      filesChanged: changeset.changes.length,
      // Line counts not available from TFVC API
      linesAdded: null,
      linesDeleted: null,
    };
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      ...this.branchCollector.convertBranches(),
      ...this.fileCollector.convertFiles(),
    ];
  }
}
