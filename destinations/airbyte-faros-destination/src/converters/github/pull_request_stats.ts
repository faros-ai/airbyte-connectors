import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class PullRequestStats extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const prStats = record.record.data;
    const repository = GitHubCommon.parseRepositoryKey(
      prStats.repository,
      source
    );

    if (!repository) return [];

    return [
      {
        model: 'vcs_PullRequest__Update',
        record: {
          at: Date.now(),
          where: {
            number: prStats.number,
            uid: prStats.number.toString(),
            repository,
          },
          mask: ['commitCount', 'commentCount', 'diffStats'],
          patch: {
            commitCount: prStats.commits,
            commentCount: prStats.comments + prStats.review_comments,
            diffStats: {
              linesAdded: prStats.additions,
              linesDeleted: prStats.deletions,
              filesChanged: prStats.changed_files,
            },
          },
        },
      },
    ];
  }
}
