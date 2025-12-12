import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Changeset} from 'faros-airbyte-common/azure-devops';
import {TfvcChange} from 'azure-devops-node-api/interfaces/TfvcInterfaces';
import {Utils} from 'faros-js-client';

import {
  BranchCollector,
  CommitKey,
  FileCollector,
  RepoKey,
  repoKey,
  VcsDiffStats,
} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzureTfvcConverter, MAX_DESCRIPTION_LENGTH} from './common';

interface ProcessChangesResult {
  commitFiles: DestinationRecord[];
  mergedChangesetIds: Set<number>;
}

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

    if (!changeset.changesetId) {
      ctx.logger.warn(`Changeset ID not found: ${JSON.stringify(changeset)}`);
      return [];
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
      return [];
    }

    const sha = String(changeset.changesetId);
    const commit: CommitKey = {sha, repository};
    const author = changeset.author?.uniqueName
      ? {uid: changeset.author.uniqueName.toLowerCase(), source: this.source}
      : undefined;

    const commitRecord: DestinationRecord = {
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
    };

    const {commitFiles, mergedChangesetIds} = this.processChanges(
      changeset.changes,
      commit,
      repository
    );

    const branchAssociations = this.createBranchAssociations(
      changeset.branch,
      commit,
      mergedChangesetIds,
      repository,
      Utils.toDate(changeset.createdDate)
    );

    const taskAssociations = this.createTaskAssociations(
      commit,
      changeset.workItems
    );

    return [commitRecord, ...commitFiles, ...branchAssociations, ...taskAssociations];
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

  private processChanges(
    changes: TfvcChange[] | undefined,
    commit: CommitKey,
    repository: RepoKey
  ): ProcessChangesResult {
    const commitFiles: DestinationRecord[] = [];
    const mergedChangesetIds = new Set<number>();

    for (const change of changes ?? []) {
      if (change.item?.path) {
        const filePath = change.item.path;
        this.fileCollector.collectFile(filePath, repository);
        commitFiles.push({
          model: 'vcs_CommitFile',
          record: {
            commit,
            file: {uid: filePath, repository},
            additions: null,
            deletions: null,
          },
        });
      }
      this.collectMergedChangesetIds(change, mergedChangesetIds);
    }
    return {commitFiles, mergedChangesetIds};
  }

  private collectMergedChangesetIds(
    change: TfvcChange,
    mergedChangesetIds: Set<number>
  ): void {
    for (const mergeSource of change.mergeSources ?? []) {
      if (mergeSource.isRename) {
        continue;
      }
      const from = mergeSource.versionFrom;
      const to = mergeSource.versionTo ?? from;
      if (from && to) {
        Array.from({length: to - from + 1}, (_, i) => from + i).forEach((id) =>
          mergedChangesetIds.add(id)
        );
      }
    }
  }

  private createBranchAssociations(
    branchName: string | undefined,
    commit: CommitKey,
    mergedChangesetIds: Set<number>,
    repository: RepoKey,
    committedAt: Date | undefined
  ): DestinationRecord[] {
    const branch = this.branchCollector.collectBranch(branchName, repository);
    if (!branch) {
      return [];
    }
    const records: DestinationRecord[] = [
      {
        model: 'vcs_BranchCommitAssociation',
        record: {commit, branch, committedAt},
      },
    ];
    for (const mergedId of mergedChangesetIds) {
      records.push({
        model: 'vcs_BranchCommitAssociation',
        record: {
          commit: {sha: String(mergedId), repository},
          branch,
          committedAt,
        },
      });
    }
    return records;
  }

  private createTaskAssociations(
    commit: CommitKey,
    workItems: Changeset['workItems']
  ): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    for (const workItem of workItems ?? []) {
      if (workItem.id) {
        records.push({
          model: 'tms_TaskCommitAssociation',
          record: {
            commit,
            task: {uid: String(workItem.id), source: 'Azure-Workitems'},
          },
        });
      }
    }
    return records;
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
