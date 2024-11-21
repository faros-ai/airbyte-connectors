import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter,DestinationModel, DestinationRecord} from '../converter';

export class Findings extends Converter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
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

    const vulnerabilityIds = [vulnerability.cve, vulnerability.ghsa].filter(
      Boolean
    );

    //cicd_ArtifactVulnerability
    //vcs_RepositoryVulnerability
    //sec_VulnerabilityIdentifier
    //sec_VulnerabilityIdentifierRelationship

    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid: finding.key,
          source: this.source,
          //   type: 'SecurityVulnerability',
          //   title: '',
          //   description: '',
          vulnerabilityIds:
            vulnerabilityIds.length > 0 ? vulnerabilityIds : undefined,
          severity: this.convertSeverityToNumber(vulnerability.severity),
          url: finding.sourcePath,
          discoveredAt: finding.scannerCreatedAt,
          discoveredBy: finding.toolName,
          publishedAt: finding.dbCreatedAt,
          remediatedAt: finding.dismissedAt,
          affectedVersions: finding.vulnerableVersion
            ? [finding.vulnerableVersion]
            : undefined,
        },
      },
    ];
  }

  private convertSeverityToNumber(severity: string): number {
    if (!severity) return undefined;
    // Convert string severity to number (0-10 scale)
    switch (severity.toLowerCase()) {
      case 'critical':
        return 10;
      case 'high':
        return 8;
      case 'medium':
        return 5;
      case 'low':
        return 2;
      default:
        return 0;
    }
  }
}
