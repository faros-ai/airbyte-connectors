import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamName,
} from '../converter';
import {GithubCommon} from './common';

export class GithubPullRequestStats implements Converter {
  readonly streamName = new StreamName('github', 'pull_request_stats');
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_PullRequest',
  ];

  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord> {
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
          where: {
            number: prStats.number,
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
