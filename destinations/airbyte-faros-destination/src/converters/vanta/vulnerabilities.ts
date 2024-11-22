import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/vanta';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {VantaConverter} from './common';
import {CicdArtifactKey, VcsRepoKey} from './types';
import {getQueryFromName, looksLikeGitCommitSha} from './utils';

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
  private readonly collectedVulnerabilities = new Set<Vulnerability>();
  private readonly collectedIdentifiers = new Set<string>();
  private readonly collectedRepoNames = new Set<string>();
  private readonly collectedArtifactCommitShas = new Set<string>();

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

    // Get catalog identifier either from vulnerability name or relatedVulns.
    let identifier = data.name;
    if (!this.isVulnerabilityCatalogIdentifier(identifier)) {
      const identifiers = data.relatedVulns.filter(
        this.isVulnerabilityCatalogIdentifier
      );
      if (identifiers.length == 0) {
        ctx.logger.warn(
          `No vulnerability catalog identifier found for vulnerability ${data.id}-${data.name}`
        );
        return records;
      }
      identifier = identifiers[0];
    }

    const category = this.getVulnerabilityCatalogCategory(identifier);
    const identifierRelationshipRecord: DestinationRecord = {
      model: 'sec_VulnerabilityIdentifierRelationship',
      record: {
        vulnerability: {uid: data.id, source: this.source},
        identifier: {uid: identifier, type: {category, detail: category}},
      },
    };
    records.push(identifierRelationshipRecord);

    this.collectedIdentifiers.add(identifier);
    this.collectedVulnerabilities.add(data);

    if (data.assetType === 'CODE_REPOSITORY') {
      this.collectedRepoNames.add(data.repoName);
    } else if (data.imageTags && data.imageTags.length > 0) {
      const commitSha = this.getCommitSha(data.imageTags);
      if (commitSha) this.collectedArtifactCommitShas.add(commitSha);
    }

    return records;
  }

  private getCommitSha(imageTags: string[]): string | null {
    for (const imageTag of imageTags) {
      if (looksLikeGitCommitSha(imageTag)) {
        return imageTag;
      }
    }
    return null;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const records: DestinationRecord[] = [];
    records.push(...this.convertIdentifiers());
    const vcsRepos = await this.getVCSRepositoriesFromNames(
      Array.from(this.collectedRepoNames),
      ctx
    );
    const cicdArtifacts = await this.getCICDArtifactsFromCommitShas(
      Array.from(this.collectedArtifactCommitShas),
      ctx
    );
    for (const vuln of this.collectedVulnerabilities) {
      if (vuln.assetType === 'CODE_REPOSITORY') {
        this.convertRepositoryVulnerability(vcsRepos, vuln, ctx, records);
      } else if (vuln.imageTags && vuln.imageTags.length > 0) {
        this.convertArtifactVulnerability(vuln, ctx, cicdArtifacts, records);
      }
    }
    return records;
  }

  private convertRepositoryVulnerability(
    vcsRepos: VcsRepoKey[],
    vuln: Vulnerability,
    ctx: StreamContext,
    records: DestinationRecord[]
  ) {
    const vcsRepo = vcsRepos?.find((repo) => repo.name === vuln.repoName);
    if (!vcsRepo) {
      ctx.logger.warn(
        `Could not find VCS repository for vulnerability ${vuln.id}`
      );
      return;
    }
    const repoVulnerabilityRecord: DestinationRecord = {
      model: 'vcs_RepositoryVulnerability',
      record: {
        vulnerability: {uid: vuln.id, source: this.source},
        repository: vcsRepo,
        url: vuln.externalURL,
        dueAt: Utils.toDate(vuln.remediateByDate),
        createdAt: Utils.toDate(vuln.firstDetectedDate),
        status: {
          category: vuln.deactivateMetadata ? 'Ignored' : 'Open',
          detail: vuln.deactivateMetadata?.deactivationReason || '',
        },
      },
    };
    records.push(repoVulnerabilityRecord);
  }

  private convertIdentifiers(): DestinationRecord[] {
    const records: DestinationRecord[] = [];
    for (const identifier of this.collectedIdentifiers) {
      const identifierRecord: DestinationRecord = {
        model: 'sec_VulnerabilityIdentifier',
        record: {
          uid: identifier,
          type: {
            category: this.getVulnerabilityCatalogCategory(identifier),
            detail: identifier,
          },
          source: this.source,
        },
      };
      records.push(identifierRecord);
    }
    return records;
  }

  private convertArtifactVulnerability(
    vuln: Vulnerability,
    ctx: StreamContext,
    cicdArtifacts: CicdArtifactKey[],
    records: DestinationRecord[]
  ) {
    const commitSha = this.getCommitSha(vuln.imageTags);
    if (!commitSha) {
      ctx.logger.warn(
        `Could not find commit sha in image tags for vulnerability ${vuln.id}`
      );
      return;
    }
    const cicdArtifact = cicdArtifacts?.find(
      (artifact) => artifact.uid === commitSha
    );
    if (!cicdArtifact) {
      ctx.logger.warn(
        `Could not find CICD artifact for vulnerability ${vuln.id} and commit sha ${commitSha}`
      );
      return;
    }
    const artifactVulnerabilityRecord: DestinationRecord = {
      model: 'cicd_ArtifactVulnerability',
      record: {
        vulnerability: {uid: vuln.id, source: this.source},
        artifact: cicdArtifact,
        url: vuln.externalURL,
        dueAt: Utils.toDate(vuln.remediateByDate),
        createdAt: Utils.toDate(vuln.firstDetectedDate),
        status: {
          category: vuln.deactivateMetadata ? 'Ignored' : 'Open',
          detail: vuln.deactivateMetadata?.deactivationReason || '',
        },
      },
    };
    records.push(artifactVulnerabilityRecord);
  }

  async getVCSRepositoriesFromNames(
    vcsRepoNames: string[],
    ctx: StreamContext
  ): Promise<VcsRepoKey[] | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.vcsRepositoryQuery,
      {
        vcsRepoNames,
      }
    );
    return result?.vcs_Repository;
  }

  async getCICDArtifactsFromCommitShas(
    commitShas: string[],
    ctx: StreamContext
  ): Promise<CicdArtifactKey[] | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.cicdArtifactQueryByCommitSha,
      {
        commitShas,
      }
    );
    return result?.cicd_Artifact;
  }

  getVulnerabilityCatalogCategory(identifierId: string): string {
    if (identifierId.includes('CVE')) {
      return 'CVE';
    } else if (identifierId.includes('GHSA')) {
      return 'GHSA';
    }
  }

  isVulnerabilityCatalogIdentifier(identifierId: string): boolean {
    return identifierId.includes('CVE') || identifierId.includes('GHSA');
  }

  private maxDescriptionLength(ctx: StreamContext): number {
    return ctx.config.max_description_lenght || MAX_DESCRIPTION_LENGTH;
  }
}
