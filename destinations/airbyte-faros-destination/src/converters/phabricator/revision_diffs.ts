import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {uniq} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorCommon, PhabricatorConverter} from './common';

interface FileDiff {
  deletions: number;
  additions: number;
  from?: string;
  to?: string;
  deleted?: boolean;
  new?: boolean;
}

interface RevisionDiff {
  id: number;
  phid: string;
  revision: {
    id: number;
    phid: string;
    dateModified: number;
  };
  repository: Dictionary<any>;
  files: ReadonlyArray<FileDiff>;
}

const NULL = '/dev/null';

export class RevisionDiffs extends PhabricatorConverter {
  private readonly logger: AirbyteLogger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_File',
    'vcs_PullRequestFile',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const diff = record.record.data as RevisionDiff;
    const res: DestinationRecord[] = [];
    const repository = PhabricatorCommon.repositoryKey(diff.repository, source);
    const diffShort = {
      id: diff.id,
      phid: diff.phid,
      revision: diff.revision,
      repository: diff.repository,
    };
    if (!repository) {
      this.logger.warn(
        `Could not determine repository from revision diff ${JSON.stringify(
          diffShort
        )}`
      );
      return res;
    } else if (!diff.revision?.id) {
      this.logger.warn(
        `Could not determine revision from revision diff ${JSON.stringify(
          diffShort
        )}`
      );
      return res;
    }

    const pullRequest = {
      number: diff.revision.id,
      uid: diff.revision.id.toString(),
      repository,
    };
    const filesChanged = uniq(
      diff.files.flatMap((f) => [f.from, f.to]).filter((f) => f && f !== NULL)
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
            linesAdded: diff.files.reduce(
              (total, file) => total + file.additions,
              0
            ),
            linesDeleted: diff.files.reduce(
              (total, file) => total + file.deletions,
              0
            ),
          },
        },
      },
    });

    for (const uid of filesChanged) {
      res.push({
        model: 'vcs_File',
        record: {uid, path: uid, repository},
      });
    }

    for (const file of diff.files) {
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
        if (file.from !== NULL) {
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
        if (file.to !== NULL) {
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
}
