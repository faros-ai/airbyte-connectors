import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {Converter, DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon} from '../github/common';

export class Findings extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_ArtifactVulnerability',
    'sec_Vulnerability',
    'sec_VulnerabilityIdentifier',
    'sec_VulnerabilityIdentifierRelationship',
    'vcs_RepositoryVulnerability',
  ];

  source = 'Tromzo';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.key;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const finding = record.record.data;
    const vulnerability = finding.vulnerability;

    const vulnerabilityKey = {uid: finding.key, source: this.source};
    const results = [];

    const cve = vulnerability.cve;
    const ghsa = vulnerability.ghsa;
    const vulnerabilityIds = [];

    if (cve) {
      vulnerabilityIds.push(cve);
      const cveIdentifier = {
        uid: cve,
        type: {category: 'CVE', detail: 'CVE'},
      };
      results.push({
        model: 'sec_VulnerabilityIdentifier',
        record: cveIdentifier,
      });
      results.push({
        model: 'sec_VulnerabilityIdentifierRelationship',
        record: {
          vulnerability: vulnerabilityKey,
          identifier: cveIdentifier,
        },
      });
    }

    if (ghsa) {
      vulnerabilityIds.push(ghsa);
      const ghsaIdentifier = {
        uid: ghsa,
        type: {category: 'GHSA', detail: 'GHSA'},
      };
      results.push({
        model: 'sec_VulnerabilityIdentifier',
        record: ghsaIdentifier,
      });
      results.push({
        model: 'sec_VulnerabilityIdentifierRelationship',
        record: {
          vulnerability: vulnerabilityKey,
          identifier: ghsaIdentifier,
        },
      });
    }

    results.push({
      model: 'sec_Vulnerability',
      record: {
        ...vulnerabilityKey,
        vulnerabilityIds: vulnerabilityIds.length ? vulnerabilityIds : null,
        severity: this.convertSeverityToScore(vulnerability.severity),
        discoveredAt: Utils.toDate(finding.scannerCreatedAt),
        discoveredBy: finding.toolName,
        remediatedAt: Utils.toDate(finding.dismissedAt),
        affectedVersions: finding.vulnerableVersion
          ? [finding.vulnerableVersion]
          : null,
      },
    });

    const asset = finding.asset;
    if (asset?.type?.toLowerCase() === 'code repository') {
      const status = this.convertStatus(finding.status);
      results.push({
        model: 'vcs_RepositoryVulnerability',
        record: {
          vulnerability: vulnerabilityKey,
          // TODO - Figure out what source to use
          repository: GitHubCommon.parseRepositoryKey(asset.name, 'GitHub'),
          dueAt: Utils.toDate(finding.dueDate),
          createdAt: Utils.toDate(finding.scannerCreatedAt),
          resolvedAt: Utils.toDate(finding.dismissedAt),
          status: status ? {category: status, detail: finding.status} : null,
        },
      });
    }

    return results;
  }

  private convertSeverityToScore(severity: string): number {
    if (!severity) return undefined;
    // Convert string severity to upper bound of score range from CVSS v4.0 Ratings
    // https://nvd.nist.gov/vuln-metrics/cvss
    switch (severity.toLowerCase()) {
      case 'critical':
        return 10;
      case 'high':
        return 8.9;
      case 'medium':
        return 6.9;
      case 'low':
        return 3.9;
      default:
        return 0;
    }
  }

  private convertStatus(status: string): string {
    if (!status) return undefined;
    switch (status.toLowerCase()) {
      case 'open':
        return 'Open';
      case 'resolved':
        return 'Resolved';
      case 'closed':
        return 'Ignored';
      default:
        return 'Custom';
    }
  }
}
