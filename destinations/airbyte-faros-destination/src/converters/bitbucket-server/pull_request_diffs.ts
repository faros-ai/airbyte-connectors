import {AirbyteRecord} from 'faros-airbyte-cdk';
import {PullRequestDiff} from 'faros-airbyte-common/bitbucket-server';

import {processPullRequestFileDiffs} from '../common/vcs';
import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketServerConverter} from './common';

export class PullRequestDiffs extends BitbucketServerConverter {
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
      repository: this.vcsRepoKey(project, repo),
    };
    const files = diff.files.map((f) => {
      return {
        ...f,
        from: f.from?.replace('src://', ''),
        to: f.to?.replace('dst://', ''),
      };
    });

    res.push(...processPullRequestFileDiffs(files, pullRequest));
    return res;
  }
}
