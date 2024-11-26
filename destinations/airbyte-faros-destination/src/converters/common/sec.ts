import {StreamContext} from '../converter';
import {getQueryFromName} from '../vanta/utils';
import {ArtifactKey} from './cicd';
import {CategoryDetail} from './common';
import {RepoKey} from './vcs';

export interface VulnerabilityIdentifier {
  uid: string;
  type: CategoryDetail;
}

export class Vulnerability {
  private static readonly vcsRepositoryQuery =
    getQueryFromName('vcsRepositoryQuery');
  private static readonly cicdArtifactQueryByCommitSha = getQueryFromName(
    'cicdArtifactQueryByCommitSha'
  );

  // Mapping Qualitative Severity Ratings to CVSS v4.0 Severity Scores
  // using the upper bound of each rating
  // https://nvd.nist.gov/vuln-metrics/cvss
  static ratingToScore(rating: string): number {
    switch (rating?.toLowerCase()) {
      case 'none':
        return 0;
      case 'low':
        return 3.9;
      case 'medium':
        return 6.9;
      case 'high':
        return 8.9;
      case 'critical':
        return 10.0;
      default:
        return 0;
    }
  }

  static identifierType(type: string): CategoryDetail {
    switch (type?.toLowerCase()) {
      case 'cve':
        return {category: 'CVE', detail: 'CVE'};
      case 'ghsa':
        return {category: 'GHSA', detail: 'GHSA'};
      default:
        return {category: 'Custom', detail: type};
    }
  }

  static async getVCSRepositoriesFromNames(
    vcsRepoNames: string[],
    ctx: StreamContext
  ): Promise<RepoKey[] | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.vcsRepositoryQuery,
      {
        vcsRepoNames,
      }
    );
    return result?.vcs_Repository;
  }

  static async getCICDArtifactsFromCommitShas(
    commitShas: string[],
    ctx: StreamContext
  ): Promise<ArtifactKey[] | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.cicdArtifactQueryByCommitSha,
      {
        commitShas,
      }
    );
    return result?.cicd_Artifact;
  }
}
