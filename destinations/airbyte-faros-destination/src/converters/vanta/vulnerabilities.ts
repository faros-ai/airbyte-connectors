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

  // TODO: move this to common.
  vcsRepositoryQuery = getQueryFromName('vcsRepositoryQuery');
  cicdArtifactQueryByCommitSha = getQueryFromName(
    'cicdArtifactQueryByCommitSha'
  );
  private readonly collectedVulnerabilities = new Set<Vulnerability>();
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

    const identifierRecords = this.processVulnerabilityIdentifier(data, ctx);
    records.push(...identifierRecords);

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
        vulnerabilityIds:
          identifierRecords.length > 0 ? [identifierRecords[0].record.uid] : [],
      },
    };
    records.push(vulnRecord);

    this.collectedVulnerabilities.add(data);

    const vulnAsset = data.asset;
    if (!vulnAsset) {
      ctx.logger.warn(
        `Vulnerability ${data.id}-${data.name} has no asset associated. VcsRepositoryVulnerability or CicdArtifactVulnerability will not be created.`
      );
      return records;
    }
    if (this.isVCSRepoVulnerability(vulnAsset)) {
      this.collectedRepoNames.add(vulnAsset.name);
    } else if (this.isCICDArtifactVulnerability(vulnAsset)) {
      const commitSha = this.getCommitSha(vulnAsset.imageTags);
      this.collectedArtifactCommitShas.add(commitSha);
    }

    return records;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const records: DestinationRecord[] = [];
    const vcsRepos = await this.getVCSRepositoriesFromNames(
      Array.from(this.collectedRepoNames),
      ctx
    );
    const cicdArtifacts = await this.getCICDArtifactsFromCommitShas(
      Array.from(this.collectedArtifactCommitShas),
      ctx
    );
    for (const vuln of this.collectedVulnerabilities) {
      if (this.isVCSRepoVulnerability(vuln.asset)) {
        this.convertRepositoryVulnerability(vcsRepos, vuln, ctx, records);
      } else if (this.isCICDArtifactVulnerability(vuln.asset)) {
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
    const vcsRepo = vcsRepos?.find((repo) => repo.name === vuln.asset.name);
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

  private processVulnerabilityIdentifier(
    vulnerability: Vulnerability,
    ctx: StreamContext
  ): DestinationRecord[] {
    // Get catalog identifier either from vulnerability name or from relatedVulns.
    let identifier = vulnerability.name;
    if (!this.isVulnerabilityCatalogIdentifier(identifier)) {
      const identifiers = vulnerability.relatedVulns.filter(
        this.isVulnerabilityCatalogIdentifier
      );
      if (identifiers.length == 0) {
        ctx.logger.warn(
          `No vulnerability catalog identifier found for vulnerability ${vulnerability.id}-${vulnerability.name}`
        );
        return [];
      }
      identifier = identifiers[0];
    }
    const category = this.getVulnerabilityCatalogCategory(identifier);
    const identifierRecord = {
      uid: identifier,
      type: {category, detail: category},
      source: this.source,
    };
    return [
      {
        model: 'sec_VulnerabilityIdentifier',
        record: identifierRecord,
      },
      {
        model: 'sec_VulnerabilityIdentifierRelationship',
        record: {
          vulnerability: {uid: vulnerability.id, source: this.source},
          identifier: identifierRecord,
        },
      },
    ];
  }

  private convertArtifactVulnerability(
    vuln: Vulnerability,
    ctx: StreamContext,
    cicdArtifacts: CicdArtifactKey[],
    records: DestinationRecord[]
  ) {
    const commitSha = this.getCommitSha(vuln.asset.imageTags);
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

  // TODO: move queries to common sec in faros-airbyte-common
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

  // TODO: use common function from faros-airbyte-common
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
