import {AirbyteRecord} from 'faros-airbyte-cdk';
import {StatsRecord, StatsType} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosStats extends GitHubConverter {
  private seenDefinitions = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
    'vcs_RepositoryMetric',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const stats = record.record.data as StatsRecord;
    const results: DestinationRecord[] = [];

    const source = this.streamName.source;
    const definitionUid = stats.type;
    const metricValueUid = toLower(
      `${source}/${stats.org}/${stats.repo}/${stats.type}/${stats.start_timestamp}`
    );

    // Write MetricDefinition once per type
    if (!this.seenDefinitions.has(definitionUid)) {
      this.seenDefinitions.add(definitionUid);
      results.push({
        model: 'faros_MetricDefinition',
        record: {
          uid: definitionUid,
          name: this.getMetricName(stats.type),
          valueType: {category: 'Numeric'},
        },
      });
    }

    // Write MetricValue
    results.push({
      model: 'faros_MetricValue',
      record: {
        uid: metricValueUid,
        value: `${stats.count}`,
        computedAt: Utils.toDate(record.record.emitted_at),
        definition: {uid: definitionUid},
      },
    });

    // Link to repository
    const repoKey = GitHubCommon.repoKey(stats.org, stats.repo, source);
    results.push({
      model: 'vcs_RepositoryMetric',
      record: {
        repository: repoKey,
        metricValue: {
          definition: {uid: definitionUid},
          uid: metricValueUid,
        },
      },
    });

    return results;
  }

  private getMetricName(type: StatsType): string {
    switch (type) {
      case StatsType.MERGED_PRS_PER_MONTH:
        return 'Merged PRs per Month';
      default:
        return type;
    }
  }
}
