import {FileDiff} from 'faros-airbyte-common/common';
import {uniq} from 'lodash';

import {DestinationRecord} from '../converter';

const NULL = '/dev/null';

export type OrgKey = {uid: string; source: string};
export type RepoKey = {uid: string; name: string; organization: OrgKey};
export type PullRequestKey = {
  number: number;
  uid: string;
  repository: RepoKey;
};
export type UserKey = {uid: string; source: string};

export type FileKey = {
  uid: string;
  repository: RepoKey;
};

export type File = FileKey & {
  path: string;
};

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
