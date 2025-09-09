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
    const organization = repository?.organization || {
      uid: this.streamName.source,
      source: this.streamName.source,
    };

    if (metric.tabLinesAdded) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: commitDate,
          endedAt: commitDate,
          assistantMetricType: AssistantMetric.AILinesAdded,
          value: metric.tabLinesAdded,
          organization,
          userEmail: metric.userEmail,
          feature: Feature.Tab,
          repository,
        })
      );
    }

    if (metric.composerLinesAdded) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: commitDate,
          endedAt: commitDate,
          assistantMetricType: AssistantMetric.AILinesAdded,
          value: metric.composerLinesAdded,
          organization,
          userEmail: metric.userEmail,
          feature: Feature.Composer,
          repository,
        })
      );
    }

    if (metric.nonAiLinesAdded) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: commitDate,
          endedAt: commitDate,
          assistantMetricType: AssistantMetric.NonAILinesAdded,
          value: metric.nonAiLinesAdded,
          organization,
          userEmail: metric.userEmail,
          repository,
        })
      );
    }

    return res;
  }

  private async getRepositoryFromFaros(
    repoName: string,
    ctx: StreamContext
  ): Promise<RepoKey | undefined> {
    // Check if repo is already cached first
    const repo = this.repoCache.get(repoName);
    if (repo) {
      return repo;
    }

    const {repoName: parsedRepoName, orgUid} = this.parseRepoName(repoName);
    if (!orgUid) {
      return undefined;
    }

    // Query Faros for repository
    try {
      const result = await ctx.farosClient?.gql(
        ctx.graph,
        vcsRepositorySingleQuery,
        {
          repoName: parsedRepoName,
          orgUid,
        }
      );

      const repo = result?.vcs_Repository?.[0] as RepoKey | undefined;

      // Cache the result (including null for not found)
      this.repoCache.set(repoName, repo || null);

      return repo;
    } catch (error) {
      ctx.logger.warn(
        `Failed to fetch repository ${repoName} from Faros: ${error}`
      );
      this.repoCache.set(repoName, null);
      return undefined;
    }
  }

  private parseRepoName(repoName: string): {repoName: string; orgUid: string} {
    // Handle format: "org/repo"
    const parts = repoName.split('/');
    if (parts.length == 2) {
      return {
        orgUid: parts[0].toLowerCase(),
        repoName: parts.slice(1).join('/'),
      };
    }
    return {repoName, orgUid: null};
  }
}
