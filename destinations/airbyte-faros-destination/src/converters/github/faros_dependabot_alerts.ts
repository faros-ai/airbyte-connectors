import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DependabotAlert} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {pick} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosDependabotAlerts extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'sec_VulnerabilityIdentifier',
    'sec_VulnerabilityIdentifierRelationship',
    'vcs_RepositoryVulnerability',
  ];

  readonly alertType = 'dependabot';

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const alert = record.record.data as DependabotAlert;
    const repository = GitHubCommon.repoKey(
      alert.org,
      alert.repo,
      this.streamName.source
    );
    const uid = GitHubCommon.vulnerabilityUid(
      alert.org,
      alert.repo,
      this.alertType,
      alert.number
    );
    const vulnerabilityIdentifiers = alert.security_advisory.identifiers.map(
      (i) => ({
        model: 'sec_VulnerabilityIdentifier',
        record: {
          uid: i.value,
          type: {
            category: ['CVE', 'GHSA'].includes(i.type) ? i.type : 'Custom',
            detail: i.type,
          },
        },
      })
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid,
          source: this.streamName.source,
          type: GitHubCommon.vulnerabilityType(alert, this.alertType),
          title: alert.security_advisory.summary,
          description: Utils.cleanAndTruncate(
            alert.security_advisory.description,
            200
          ),
          vulnerabilityIds: vulnerabilityIdentifiers.map((vi) => vi.record.uid),
          severity: GitHubCommon.vulnerabilitySeverity(alert),
          url: alert.html_url,
          publishedAt: Utils.toDate(alert.security_advisory.published_at),
          remediatedInVersions: [
            alert.security_vulnerability.first_patched_version.identifier,
          ],
          affectedVersions: [
            alert.security_vulnerability.vulnerable_version_range,
          ],
        },
      },
      ...vulnerabilityIdentifiers,
      ...vulnerabilityIdentifiers.map((vi) => ({
        model: 'sec_VulnerabilityIdentifierRelationship',
        record: {
          vulnerability: {uid, source: this.streamName.source},
          identifier: pick(vi.record, ['uid', 'type']),
        },
      })),
      {
        model: 'vcs_RepositoryVulnerability',
        record: {
          vulnerability: {uid, source: this.streamName.source},
          repository,
          url: alert.html_url,
          createdAt: Utils.toDate(alert.created_at),
          resolvedAt:
            Utils.toDate(alert.fixed_at) ??
            Utils.toDate(alert.dismissed_at) ??
            Utils.toDate(alert.auto_dismissed_at) ??
            null,
          status: GitHubCommon.vulnerabilityStatus(alert),
        },
      },
    ];
  }
}
