import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toNumber} from 'lodash';

import {CategoryDetail} from '../common/common';
import {Vulnerability} from '../common/sec';
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

  id(record: AirbyteRecord): string {
    return record?.record?.data?.key;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const finding = record.record.data;
    const vulnerability = finding.vulnerability;
    const vulnerabilityKey = {uid: finding.key, source: this.source};

    // Process vulnerability identifiers
    const identifiers = this.processVulnerabilityIdentifiers(
      vulnerability,
      vulnerabilityKey
    );
    const results = Array.from(identifiers.values()).flat();
    const vulnerabilityIds = Array.from(identifiers.keys());
    const severity = this.convertSeverity(vulnerability);

    // Create main vulnerability record
    results.push({
      model: 'sec_Vulnerability',
      record: {
        ...vulnerabilityKey,
        title: vulnerability.summary,
        description: vulnerability.description,
        url: finding.url,
        vulnerabilityIds: vulnerabilityIds.length ? vulnerabilityIds : null,
        severity,
        discoveredBy: finding.toolName,
        type: this.convertType(finding.toolName),
        affectedVersions: finding.vulnerableVersion
          ? [finding.vulnerableVersion]
          : null,
      },
    });

    // TODO - Process cicd_ArtifactVulnerability
    if (finding?.asset?.type?.toLowerCase() === 'code repository') {
      results.push(
        this.processRepositoryVulnerability(finding, vulnerabilityKey)
      );
    }
    return results;
  }

  private processVulnerabilityIdentifiers(
    vulnerability: any,
    vulnerabilityKey: {uid: string; source: string}
  ): Map<string, DestinationRecord[]> {
    const identifiers = new Map<string, DestinationRecord[]>();

    if (vulnerability?.cve) {
      identifiers.set(
        vulnerability.cve,
        this.makeIdentifierRecord(vulnerability.cve, 'CVE', vulnerabilityKey)
      );
    }

    if (vulnerability?.ghsa) {
      identifiers.set(
        vulnerability.ghsa,
        this.makeIdentifierRecord(vulnerability.ghsa, 'GHSA', vulnerabilityKey)
      );
    }

    return identifiers;
  }

  private makeIdentifierRecord(
    uid: string,
    type: string,
    vulnerability: {uid: string; source: string}
  ): DestinationRecord[] {
    const identifier = {uid, type: Vulnerability.identifierType(type)};

    return [
      {
        model: 'sec_VulnerabilityIdentifier',
        record: identifier,
      },
      {
        model: 'sec_VulnerabilityIdentifierRelationship',
        record: {vulnerability, identifier},
      },
    ];
  }

  private processRepositoryVulnerability(
    finding: any,
    vulnerabilityKey: {uid: string; source: string}
  ): DestinationRecord {
    return {
      model: 'vcs_RepositoryVulnerability',
      record: {
        vulnerability: vulnerabilityKey,
        repository: GitHubCommon.parseRepositoryKey(
          finding?.asset?.name,
          finding?.asset?.service
        ),
        dueAt: Utils.toDate(finding.dueDate),
        createdAt: Utils.toDate(finding.scannerCreatedAt),
        resolvedAt: Utils.toDate(
          finding.scannerDismissedAt ?? finding.dismissedAt
        ),
        status: this.convertStatus(finding.status),
      },
    };
  }

  private convertStatus(status: string): CategoryDetail {
    if (!status) return null;

    // open, closed, in process, false positive, resolved, triaged, duplicate, risk accepted
    const statusMap: Record<string, string> = {
      closed: 'Abandoned',
      duplicate: 'Ignored',
      'false positive': 'Ignored',
      'in process': 'Open',
      open: 'Open',
      resolved: 'Resolved',
      'risk accepted': 'Ignored',
      triaged: 'Open',
    };

    const category = statusMap[status.toLowerCase()] ?? 'Custom';
    return {category, detail: status};
  }

  private convertType(toolName: string): CategoryDetail {
    if (!toolName) return null;

    if (toolName.toLowerCase() === 'github dependabot') {
      return {category: 'Dependency', detail: toolName};
    } else if (toolName.toLowerCase() === 'github secret scanning') {
      return {category: 'SecretLeak', detail: toolName};
    }
    return {category: 'Custom', detail: toolName};
  }

  private convertSeverity(vulnerability: any): number | null {
    if (!vulnerability?.score && !vulnerability?.severity) {
      return null;
    }
    const score = toNumber(vulnerability.score);
    return isFinite(score) && score !== 0
      ? score
      : Vulnerability.ratingToScore(vulnerability.severity);
  }
}
