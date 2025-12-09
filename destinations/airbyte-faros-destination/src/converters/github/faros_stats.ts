import {AirbyteRecord} from 'faros-airbyte-cdk';
import {StatsRecord, StatsType} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosStats extends GitHubConverter {
  private readonly seenDefinitions = new Set<string>();
  private readonly seenTags = new Set<string>();

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'faros_MetricDefinition',
    'faros_MetricValue',
    'faros_MetricValueTag',
    'faros_Tag',
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
      `${source}/${stats.org}/${stats.repo}/${stats.type}/`
    ).concat(`${stats.start_timestamp}`);
    const metricValueRef = {
      definition: {uid: definitionUid},
      uid: metricValueUid,
    };

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

    // Write tags for start_timestamp and end_timestamp (deduplicated)
    const startTagUid = `start_timestamp:${stats.start_timestamp}`;
    const endTagUid = `end_timestamp:${stats.end_timestamp}`;

    if (!this.seenTags.has(startTagUid)) {
      this.seenTags.add(startTagUid);
      results.push({
        model: 'faros_Tag',
        record: {
          uid: startTagUid,
          key: 'start_timestamp',
          value: stats.start_timestamp,
        },
      });
    }
    if (!this.seenTags.has(endTagUid)) {
      this.seenTags.add(endTagUid);
      results.push({
        model: 'faros_Tag',
        record: {
          uid: endTagUid,
          key: 'end_timestamp',
          value: stats.end_timestamp,
        },
      });
    }

    // Write MetricValue, MetricValueTags, and RepositoryMetric
    const repoKey = GitHubCommon.repoKey(stats.org, stats.repo, source);
    results.push(
      {
        model: 'faros_MetricValue',
        record: {
          uid: metricValueUid,
          value: `${stats.count}`,
          computedAt: Utils.toDate(record.record.emitted_at),
          definition: {uid: definitionUid},
        },
      },
      {
        model: 'faros_MetricValueTag',
        record: {
          value: metricValueRef,
          tag: {uid: startTagUid},
        },
      },
      {
        model: 'faros_MetricValueTag',
        record: {
          value: metricValueRef,
          tag: {uid: endTagUid},
        },
      },
      {
        model: 'vcs_RepositoryMetric',
        record: {
          repository: repoKey,
          metricValue: metricValueRef,
        },
      }
    );

    return results;
  }

  private getMetricName(type: StatsType): string {
    if (type === StatsType.MERGED_PRS_PER_MONTH) {
      return 'Merged PRs per Month';
    }
    return type;
  }
}
