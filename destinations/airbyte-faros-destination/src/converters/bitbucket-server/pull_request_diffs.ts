import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequestDiff} from 'faros-airbyte-common/bitbucket-server';
import {uniq} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

const NULL = '/dev/null';

export class PullRequestDiffs extends BitbucketServerConverter {
  private readonly logger: AirbyteLogger = new AirbyteLogger();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_File',
    'vcs_PullRequestFile',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const diff = record.record.data as PullRequestDiff;
    const res: DestinationRecord[] = [];
    const [project, repo] =
      diff.computedProperties.pullRequest.repository.fullName.split('/');
    const pullRequestId = diff.computedProperties.pullRequest.id;
    const pullRequest = {
      number: pullRequestId,
      uid: pullRequestId.toString(),
      repository: this.vcsRepoRef(project, repo),
    };
    const repository = pullRequest.repository;
    const files = diff.files.map((f) => {
      return {
        ...f,
        from: f.from?.replace('src://', ''),
        to: f.to?.replace('dst://', ''),
      };
    });
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
            linesAdded: files.reduce(
              (total, file) => total + file.additions,
              0
            ),
            linesDeleted: files.reduce(
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
