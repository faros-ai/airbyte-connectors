import {AirbyteRecord} from 'faros-airbyte-cdk';
import {ContributorStats} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosContributorsStats extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_RepositoryContribution',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const {org, repo, user, total, weeks} = record.record
      .data as ContributorStats;
    if (!user) {
      return [];
    }
    const weekly = weeks
      .filter((w) => (w?.a > 0 || w?.d > 0 || w?.c > 0) && w?.w > 0)
      .map((w) => ({
        additions: w.a,
        deletions: w.d,
        commits: w.c,
        startOfWeek: Utils.toDate(w.w * 1000).toISOString(),
      }));
    return [
      {
        model: 'vcs_RepositoryContribution',
        record: {
          repository: GitHubCommon.repoKey(org, repo, this.streamName.source),
          author: {uid: user, source: this.streamName.source},
          totalCommits: total,
          weekly,
        },
      },
    ];
  }
}
