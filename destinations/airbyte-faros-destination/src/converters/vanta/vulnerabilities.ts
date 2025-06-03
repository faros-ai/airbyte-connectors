import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Vulnerability} from 'faros-airbyte-common/vanta';
import {Utils} from 'faros-js-client';

import {ArtifactKey, getCICDArtifactsFromCommitShas} from '../common/cicd';
import {
  Vulnerability as VulnerabilityCommon,
  VulnerabilityIdentifier,
} from '../common/sec';
import {getVCSRepositoriesFromNames, RepoKey} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {VantaConverter} from './common';

const MAX_DESCRIPTION_LENGTH = 1000;

export abstract class Vulnerabilities extends VantaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'sec_VulnerabilityIdentifier',
    'sec_VulnerabilityIdentifierRelationship',
    'vcs_RepositoryVulnerability',
    'cicd_ArtifactVulnerability',
  ];

  private readonly collectedVulnerabilities = new Set<Vulnerability>();
  private readonly collectedRepoNames = new Set<string>();
  private readonly collectedArtifactCommitShas = new Set<string>();
  private readonly vulnerabilitiesWithoutAsset = new Set<string>();
  private readonly vulnerabilitiesWithoutRepo = new Set<string>();
  private readonly vulnerabilitiesWithoutArtifact = new Set<string>();
  private readonly vulnerabilitiesWithoutCommitSha = new Set<string>();
  private readonly vulnerabilitiesWithoutIdentifier = new Set<string>();

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
        severity: this.getSeverityScore(data),
        url: data.externalURL,
        discoveredAt: Utils.toDate(data.firstDetectedDate),
        vulnerabilityIds:
          identifierRecords.length > 0 ? [identifierRecords[0].record.uid] : [],
        affectedVersions: data.packageIdentifier
          ? [data.packageIdentifier]
          : [],
      },
    };
    records.push(vulnRecord);

    this.collectedVulnerabilities.add(data);

    const vulnAsset = data.asset;
    if (!vulnAsset) {
      this.vulnerabilitiesWithoutAsset.add(data.id);
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
    const vcsRepos = await getVCSRepositoriesFromNames(
      Array.from(this.collectedRepoNames),
      ctx
    );
    const cicdArtifacts = await getCICDArtifactsFromCommitShas(
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
    // Log warnings for different cases of missing data
    this.logVulnerabilityWarnings(
      ctx,
      this.vulnerabilitiesWithoutAsset,
      'Vulnerabilities without an asset associated (no vcs_RepositoryVulnerability/cicd_ArtifactVulnerability created)'
    );
    this.logVulnerabilityWarnings(
      ctx,
      this.vulnerabilitiesWithoutRepo,
      'Vulnerabilities with no repository found'
    );
    this.logVulnerabilityWarnings(
      ctx,
      this.vulnerabilitiesWithoutArtifact,
      'Vulnerabilities with no artifact found'
    );
    this.logVulnerabilityWarnings(
      ctx,
      this.vulnerabilitiesWithoutCommitSha,
      'Vulnerabilities with no commit sha found in image tags'
    );
    this.logVulnerabilityWarnings(
      ctx,
      this.vulnerabilitiesWithoutIdentifier,
      'Vulnerabilities with no catalog identifier found'
    );
    return records;
  }

  private convertRepositoryVulnerability(
    vcsRepos: RepoKey[],
    vuln: Vulnerability,
    ctx: StreamContext,
    records: DestinationRecord[]
  ) {
    const vcsRepo = vcsRepos?.find((repo) => repo.name === vuln.asset.name);
    if (!vcsRepo) {
      this.vulnerabilitiesWithoutRepo.add(`${vuln.id}-${vuln.asset.name}`);
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
  private extractVulnId(value: string): [string, string] | null {
    const cveMatch = value.match(/(CVE-\d{4}-\d{4,7})/);
    if (cveMatch) {
      return ['CVE', cveMatch[1]];
    }

    const ghsaMatch = value.match(/(GHSA-[\w]{4}-[\w]{4}-[\w]{4})/);
    if (ghsaMatch) {
      return ['GHSA', ghsaMatch[1]];
    }

    return null;
  }

  private grabVulnerabilityIdentifierFromOtherFields(
    vulnerability: Vulnerability
  ): VulnerabilityIdentifier | null {
    if (vulnerability.name) {
      if (this.extractVulnId(vulnerability.name)) {
        const [type, id] = this.extractVulnId(vulnerability.name);
        return {
          uid: id,
          type: VulnerabilityCommon.identifierType(type),
        };
      }
    }
    return null;
  }

  private processVulnerabilityIdentifier(
    vulnerability: Vulnerability,
    ctx: StreamContext
  ): DestinationRecord[] {
    let identifierRecord: VulnerabilityIdentifier;
    switch (vulnerability.vulnerabilityType) {
      case 'COMMON': {
        // Use name as identifier and extract catalog abbreviation
        const type = VulnerabilityCommon.identifierType(
          vulnerability.name.split('-')?.[0]
        );
        identifierRecord = {
          uid: vulnerability.name,
          type,
        };
        break;
      }

      case 'GROUPED':
        // Use the first related vulnerability as identifier
        if (
          vulnerability.relatedVulns &&
          vulnerability.relatedVulns.length > 0
        ) {
          const uid = vulnerability.relatedVulns[0];
          identifierRecord = {
            uid,
            type: VulnerabilityCommon.identifierType(uid.split('-')?.[0]),
          };
        }
        break;
    }
    if (!identifierRecord) {
      identifierRecord =
        this.grabVulnerabilityIdentifierFromOtherFields(vulnerability);
    }
    if (!identifierRecord) {
      this.vulnerabilitiesWithoutIdentifier.add(
        `${vulnerability.id}-${vulnerability.name}`
      );
      return [];
    }
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
    cicdArtifacts: ArtifactKey[],
    records: DestinationRecord[]
  ) {
    const commitSha = this.getCommitSha(vuln.asset.imageTags);
    if (!commitSha) {
      this.vulnerabilitiesWithoutCommitSha.add(vuln.id);
      return;
    }
    const cicdArtifact = cicdArtifacts?.find(
      (artifact) => artifact.uid === commitSha
    );
    if (!cicdArtifact) {
      this.vulnerabilitiesWithoutArtifact.add(`${vuln.id}-${commitSha}`);
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

  private maxDescriptionLength(ctx: StreamContext): number {
    return ctx.config.max_description_lenght || MAX_DESCRIPTION_LENGTH;
  }

  private getSeverityScore(vuln: Vulnerability): number | null {
    if (vuln.cvssSeverityScore) {
      return vuln.cvssSeverityScore;
    }
    if (vuln.severity) {
      return VulnerabilityCommon.ratingToScore(vuln.severity);
    }
    return null;
  }
}
