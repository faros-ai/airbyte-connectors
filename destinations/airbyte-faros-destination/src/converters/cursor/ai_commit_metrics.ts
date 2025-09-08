import {AirbyteRecord} from 'faros-airbyte-cdk';
import {AiCommitMetricItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {AssistantMetric, RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {getQueryFromName} from '../vanta/utils';
import {CursorConverter, Feature} from './common';

const vcsRepositorySingleQuery = getQueryFromName('vcsRepositorySingleQuery');

export class AiCommitMetrics extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  // Cache repository lookups: key = "org/repo", value = RepoKey or null if not found
  private readonly repoCache = new Map<string, RepoKey | null>();

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

    // Get repository from Faros if available, with caching
    const repository = metric.repoName
      ? await this.getRepositoryFromFaros(metric.repoName, ctx)
      : undefined;

    // Use organization from repository if found, otherwise use default
    const org = repository?.organization || {
      uid: this.streamName.source,
      source: this.streamName.source,
    };

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

  private async getRepositoryFromFaros(
    repoName: string,
    ctx: StreamContext
  ): Promise<RepoKey | undefined> {
    const orgFromRepoName = this.extractOrgFromRepo(repoName);
    if (!orgFromRepoName) {
      return undefined;
    }

    const cacheKey = `${orgFromRepoName}/${this.extractRepoName(repoName)}`;

    // Check cache first
    if (this.repoCache.has(cacheKey)) {
      const cached = this.repoCache.get(cacheKey);
      return cached || undefined;
    }

    // Query Faros for repository
    try {
      const result = await ctx.farosClient?.gql(
        ctx.graph,
        vcsRepositorySingleQuery,
        {
          repoName: this.extractRepoName(repoName),
          orgUid: orgFromRepoName.toLowerCase(),
        }
      );

      const repo = result?.vcs_Repository?.[0] as RepoKey | undefined;

      // Cache the result (including null for not found)
      this.repoCache.set(cacheKey, repo || null);

      return repo;
    } catch (error) {
      // On error, cache null to avoid retrying
      this.repoCache.set(cacheKey, null);
      return undefined;
    }
  }

  private extractOrgFromRepo(repoName: string | null): string | null {
    if (!repoName) return null;

    // Handle format: "org/repo"
    const parts = repoName.split('/');
    if (parts.length >= 2) {
      return parts[0].toLowerCase();
    }
    return null;
  }

  private extractRepoName(repoName: string): string {
    // Extract repo name without org prefix if present
    const parts = repoName.split('/');
    return parts.length >= 2 ? parts.slice(1).join('/') : repoName;
  }
}
