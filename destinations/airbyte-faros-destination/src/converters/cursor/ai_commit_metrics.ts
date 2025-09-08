import {AirbyteRecord} from 'faros-airbyte-cdk';
import {AiCommitMetricItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter, Feature} from './common';

export class AiCommitMetrics extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const metric = record.record.data as AiCommitMetricItem;
    return `${metric.commitHash}__${metric.userEmail}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const metric = record.record.data as AiCommitMetricItem;

    if (!metric.userEmail || !metric.commitHash) {
      return [];
    }

    const res: DestinationRecord[] = [];
    const timestamp = metric.commitTs || metric.createdAt;
    const commitDate = Utils.toDate(timestamp);

    // Extract organization from repo name or use default
    const org = this.extractOrgFromRepo(metric.repoName) || 'cursor';

    // Create repository reference if available
    const repository = metric.repoName
      ? this.getRepositoryRef(metric.repoName, org)
      : undefined;

    // Tab metrics - only track lines added as accepted lines
    if (metric.tabLinesAdded > 0) {
      res.push(
        ...this.getAssistantMetric(
          commitDate,
          commitDate,
          AssistantMetric.Custom,
          metric.tabLinesAdded,
          org,
          metric.userEmail,
          'tabLinesAdded',
          undefined,
          Feature.Tab,
          repository
        )
      );
    }

    // Composer metrics - only track lines added as accepted lines
    if (metric.composerLinesAdded > 0) {
      res.push(
        ...this.getAssistantMetric(
          commitDate,
          commitDate,
          AssistantMetric.Custom,
          metric.composerLinesAdded,
          org,
          metric.userEmail,
          'composerLinesAdded',
          undefined,
          Feature.Composer,
          repository
        )
      );
    }

    // Non-AI (Manual) metrics - only track lines added
    if (!isNil(metric.nonAiLinesAdded) && metric.nonAiLinesAdded > 0) {
      res.push(
        ...this.getAssistantMetric(
          commitDate,
          commitDate,
          AssistantMetric.Custom,
          metric.nonAiLinesAdded,
          org,
          metric.userEmail,
          'nonAiLinesAdded',
          undefined,
          Feature.Manual,
          repository
        )
      );
    }

    return res;
  }

  private extractOrgFromRepo(repoName: string | null): string | null {
    if (!repoName) return null;

    // Handle format: "org/repo" or just "repo"
    const parts = repoName.split('/');
    if (parts.length >= 2) {
      return parts[0].toLowerCase();
    }
    return null;
  }

  private getRepositoryRef(repoName: string, org: string) {
    // Extract repo name without org prefix if present
    const parts = repoName.split('/');
    const name = parts.length >= 2 ? parts.slice(1).join('/') : repoName;

    return {
      name: name,
      organization: {
        uid: org.toLowerCase(),
        source: this.streamName.source,
      },
    };
  }
}
