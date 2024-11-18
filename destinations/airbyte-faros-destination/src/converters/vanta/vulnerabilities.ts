import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/vanta';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {VantaConverter} from './common';
import {CicdArtifactKey, VcsRepoKey} from './types';
import {getQueryFromName} from './utils';

const MAX_DESCRIPTION_LENGTH = 1000;

export abstract class Vulnerabilities extends VantaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'sec_VulnerabilityIdentifier',
    'sec_VulnerabilityIdentifierRelationship',
    'vcs_RepositoryVulnerability',
    'cicd_ArtifactVulnerability',
  ];

  vcsRepositoryQuery = getQueryFromName('vcsRepositoryQuery');
  cicdArtifactQueryByCommitSha = getQueryFromName(
    'cicdArtifactQueryByCommitSha'
  );

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertVulnerabilityRecord(
      record?.record?.data as Vulnerability,
      ctx
    );
  }

  async convertVulnerabilityRecord(
    data: Vulnerability,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const records: DestinationRecord[] = [];

    // Creating the base sec_Vulnerability record
    const vulnRecord: DestinationRecord = {
      model: 'sec_Vulnerability',
      record: {
        uid: data.id,
        source: this.source,
        title: data.name,
        description: Utils.cleanAndTruncate(
          data.description,
          this.maxDescriptionLength(ctx)
        ),
        severity: data.severity
          ? this.severityMap[data.severity].toString()
          : '0',
        url: data.externalURL,
        discoveredAt: Utils.toDate(data.firstDetectedDate),
        vulnerabilityIds: data.relatedVulns,
      },
    };
    records.push(vulnRecord);

    const identifier = data.name;
    const category = this.getVulnerabilityCatalogCategory(identifier);
    const type = {category, detail: category};
    const identifierRecord: DestinationRecord = {
      model: 'sec_VulnerabilityIdentifier',
      record: {
        uid: identifier,
        type,
      },
    };
    records.push(identifierRecord);

    const identifierRelationshipRecord: DestinationRecord = {
      model: 'sec_VulnerabilityIdentifierRelationship',
      record: {
        vulnerability: {uid: data.id, source: this.source},
        identifier: {uid: identifier, type},
      },
    };
    records.push(identifierRelationshipRecord);

    // If the vulnerability has repo name but no image tag,
    // we assume it is a VCS vulnerability and search for the related repository
    if (data.repoName && !data.imageTag) {
      const vcsRepo = await this.getVCSRepositoryFromName(data.repoName, ctx);
      const repoVulnerabilityRecord: DestinationRecord = {
        model: 'vcs_RepositoryVulnerability',
        record: {
          vulnerability: {uid: data.id, source: this.source},
          repository: vcsRepo,
          url: data.externalURL,
          dueAt: Utils.toDate(data.remediateByDate),
          createdAt: Utils.toDate(data.firstDetectedDate),
          status: {
            category: data.deactivateMetadata ? 'Ignored' : 'Open',
            detail: data.deactivateMetadata?.deactivationReason || '',
          },
        },
      };
      records.push(repoVulnerabilityRecord);
    } else if (data.imageTag) {
      const cicdArtifact = await this.getCICDArtifactImageTag(
        data.imageTag,
        ctx
      );
      const artifactVulnerabilityRecord: DestinationRecord = {
        model: 'cicd_ArtifactVulnerability',
        record: {
          vulnerability: {uid: data.id, source: this.source},
          artifact: cicdArtifact,
          url: data.externalURL,
          dueAt: Utils.toDate(data.remediateByDate),
          createdAt: Utils.toDate(data.firstDetectedDate),
          status: {
            category: data.deactivateMetadata ? 'Ignored' : 'Open',
            detail: data.deactivateMetadata?.deactivationReason || '',
          },
        },
      };
      records.push(artifactVulnerabilityRecord);
    }

    return records;
  }

  async getVCSRepositoryFromName(
    vcsRepoName: string,
    ctx: StreamContext
  ): Promise<VcsRepoKey | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.vcsRepositoryQuery,
      {
        vcsRepoName,
      }
    );
    const results = result?.vcs_Repository;
    if (!results || results.length === 0) {
      ctx.logger.debug(
        `Did not get any results for vcs_Repository query with name "${vcsRepoName}"`
      );
      return null;
    }
    if (results.length > 1) {
      ctx.logger.warn(
        `Got more than one result for vcs_Repository query with name "${vcsRepoName}, using the first one"`
      );
    }
    return results[0];
  }

  async getCICDArtifactImageTag(
    commitSha: string,
    ctx: StreamContext
  ): Promise<CicdArtifactKey | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.cicdArtifactQueryByCommitSha,
      {
        commitSha,
      }
    );
    const results = result?.cicd_Artifact;
    if (!results || results.length === 0) {
      ctx.logger.debug(
        `Did not get any results for cicd_Artifact query with commit sha "${commitSha}"`
      );
      return null;
    }
    if (results.length > 1) {
      ctx.logger.warn(
        `Got more than one result for cicd_Artifact query with name "${commitSha}, using the first one"`
      );
    }
    return results[0];
  }

  getVulnerabilityCatalogCategory(identifierId: string): string {
    if (identifierId.includes('CVE')) {
      return 'CVE';
    } else if (identifierId.includes('GHSA')) {
      return 'GHSA';
    }
  }
  private maxDescriptionLength(ctx: StreamContext): number {
    return ctx.config.max_description_lenght || MAX_DESCRIPTION_LENGTH;
  }
}
