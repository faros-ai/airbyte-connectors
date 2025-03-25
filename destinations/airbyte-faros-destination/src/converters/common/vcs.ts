import {FileDiff} from 'faros-airbyte-common/common';
import {uniq} from 'lodash';

import {DestinationRecord, StreamContext} from '../converter';
import {getQueryFromName} from '../vanta/utils';

const NULL = '/dev/null';

export interface VcsDiffStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

export enum OrgTypeCategory {
  Organization = 'Organization',
  Workspace = 'Workspace',
  Group = 'Group',
  Custom = 'Custom',
}

export enum PullRequestStateCategory {
  Closed = 'Closed',
  Merged = 'Merged',
  Open = 'Open',
  Custom = 'Custom',
}

export enum PullRequestReviewStateCategory {
  Approved = 'Approved',
  Commented = 'Commented',
  ChangesRequested = 'ChangesRequested',
  Dismissed = 'Dismissed',
  Custom = 'Custom',
}

export enum UserTypeCategory {
  Bot = 'Bot',
  Organization = 'Organization',
  User = 'User',
  Custom = 'Custom',
}

export type OrgKey = {uid: string; source: string};
export type RepoKey = {uid: string; name: string; organization: OrgKey};
export type PullRequestKey = {
  number: number;
  uid: string;
  repository: RepoKey;
};
export type CommitKey = {sha: string; repository: RepoKey};
export type UserKey = {uid: string; source: string};

export type FileKey = {
  uid: string;
  repository: RepoKey;
};

export type File = FileKey & {
  path: string;
};

export function fileKey(filePath: string, repoKey: RepoKey): FileKey {
  return {
    uid: filePath,
    repository: repoKey,
  };
}

export function fileKeyToString(fileKey: FileKey): string {
  return `${fileKey.repository.organization.uid}/${fileKey.repository.name}/${fileKey.uid}`;
}

export function processPullRequestFileDiffs(
  files: ReadonlyArray<FileDiff>,
  pullRequest: PullRequestKey
): DestinationRecord[] {
  const res = [];
  const repository = pullRequest.repository;
  const filesChanged = uniq(
    files.flatMap((f) => [f.from, f.to]).filter((f) => f && f !== NULL)
  );

  res.push({
    model: 'vcs_PullRequest__Update',
    record: {
      at: Date.now(),
      where: pullRequest,
      mask: ['diffStats'],
      patch: {
        diffStats: {
          filesChanged: filesChanged.length,
          linesAdded: files.reduce((total, file) => total + file.additions, 0),
          linesDeleted: files.reduce(
            (total, file) => total + file.deletions,
            0
          ),
        },
      },
    },
  });

  for (const uid of filesChanged) {
    res.push({model: 'vcs_File', record: {uid, path: uid, repository}});
  }

  for (const file of files) {
    if (file.from && file.from !== NULL && file.from === file.to) {
      res.push({
        model: 'vcs_PullRequestFile',
        record: {
          file: {uid: file.from, path: file.from, repository},
          pullRequest,
          additions: file.additions,
          deletions: file.deletions,
        },
      });
    } else {
      if (file.from && file.from !== NULL) {
        res.push({
          model: 'vcs_PullRequestFile',
          record: {
            file: {uid: file.from, path: file.from, repository},
            pullRequest,
            additions: 0,
            deletions: file.deletions,
          },
        });
      }
      if (file.to && file.to !== NULL) {
        res.push({
          model: 'vcs_PullRequestFile',
          record: {
            file: {uid: file.to, path: file.to, repository},
            pullRequest,
            additions: file.additions,
            deletions: 0,
          },
        });
      }
    }
  }

  return res;
}

export class FileCollector {
  private readonly collectedFiles = new Map<string, File>();

  collectFile(filePath: string, repoKey: RepoKey): void {
    const key = fileKey(filePath, repoKey);
    const keyStr = fileKeyToString(key);

    if (!this.collectedFiles.has(keyStr)) {
      const file: File = {
        ...key,
        path: filePath,
      };
      this.collectedFiles.set(keyStr, file);
    }
  }

  convertFiles(): DestinationRecord[] {
    return Array.from(this.collectedFiles.values()).map((file) => ({
      model: 'vcs_File',
      record: file,
    }));
  }
}

const vcsRepositoryQuery = getQueryFromName('vcsRepositoryQuery');

export async function getVCSRepositoriesFromNames(
  vcsRepoNames: string[],
  ctx: StreamContext
): Promise<RepoKey[] | null> {
  const result = await ctx.farosClient.gql(ctx.graph, vcsRepositoryQuery, {
    vcsRepoNames,
  });
  return result?.vcs_Repository;
}
