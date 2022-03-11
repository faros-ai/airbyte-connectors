import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class PullRequestStats extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const prStats = record.record.data;
    const repository = GithubCommon.parseRepositoryKey(
      prStats.repository,
      source
    );

    if (!repository) return [];

    return [
      {
        model: 'vcs_PullRequest__Update',
        record: {
          at: record.record.emitted_at,
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
