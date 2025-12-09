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

export class Changesets extends AzureTfvcConverter {
  private readonly branchCollector = new BranchCollector();
  private readonly fileCollector = new FileCollector();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskCommitAssociation',
    'vcs_Branch',
    'vcs_BranchCommitAssociation',
    'vcs_Commit',
    'vcs_CommitFile',
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

    if (!changeset.changesetId) {
      ctx.logger.warn(`Changeset ID not found: ${JSON.stringify(changeset)}`);
      return res;
    }

    const repository = repoKey(
      changeset.organization,
      changeset.project?.name,
      this.source
    );
    if (!repository) {
      ctx.logger.warn(
        `Organization or project name not found: ${JSON.stringify(changeset)}`
      );
      return res;
    }

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
          committedAt: Utils.toDate(changeset.createdDate),
        },
      });
    }

    // Track merged changeset IDs to avoid duplicate associations
    const mergedChangesetIds = new Set<number>();

    // Create vcs_CommitFile records and collect files from changes
    for (const change of changeset.changes ?? []) {
      if (change.item?.path) {
        const filePath = change.item.path;
        this.fileCollector.collectFile(filePath, repository);

        res.push({
          model: 'vcs_CommitFile',
          record: {
            commit,
            file: {
              uid: filePath,
              repository,
            },
            // TFVC API doesn't provide line-level diff stats
            additions: null,
            deletions: null,
          },
        });
      }

      // Collect merged changeset IDs from merge sources
      // These are changesets that were merged into this changeset
      for (const mergeSource of change.mergeSources ?? []) {
        if (mergeSource.isRename) {
          continue; // Skip renames, only process actual merges
        }
        // versionFrom and versionTo represent an inclusive range of changesets merged
        const from = mergeSource.versionFrom;
        const to = mergeSource.versionTo ?? from;
        if (from && to) {
          Array.from({length: to - from + 1}, (_, i) => from + i).forEach(
            (id) => mergedChangesetIds.add(id)
          );
        }
      }
    }

    // Create vcs_BranchCommitAssociation for merged changesets
    // This associates the merged commits with the target branch
    if (branch) {
      for (const mergedChangesetId of mergedChangesetIds) {
        const mergedCommit: CommitKey = {
          sha: String(mergedChangesetId),
          repository,
        };
        res.push({
          model: 'vcs_BranchCommitAssociation',
          record: {
            commit: mergedCommit,
            branch,
            committedAt: Utils.toDate(changeset.createdDate),
          },
        });
      }
    }

    // Create tms_TaskCommitAssociation records for linked work items
    for (const workItem of changeset.workItems ?? []) {
      if (workItem.id) {
        res.push({
          model: 'tms_TaskCommitAssociation',
          record: {
            commit,
            task: {
              uid: String(workItem.id),
              source: 'Azure-Workitems',
            },
          },
        });
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
