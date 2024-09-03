import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DependabotAlert} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosDependabotAlerts extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'vcs_RepositoryVulnerability',
  ];

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
      'dependabot',
      alert.number
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid,
          source: this.streamName.source,
          title: alert.security_advisory.summary,
          description: Utils.cleanAndTruncate(
            alert.security_advisory.description,
            200
          ),
          vulnerabilityIds: alert.security_advisory.identifiers.map(
            (i) => i.value
          ),
          severity: getSeverity(alert),
          url: alert.html_url,
          publishedAt: Utils.toDate(alert.security_advisory.published_at),
          remediatedInVersions: [
            alert.security_vulnerability.first_patched_version,
          ],
          affectedVersions: [
            alert.security_vulnerability.vulnerable_version_range,
          ],
        },
      },
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
          status: getStatus(alert),
        },
      },
    ];
  }
}

function getSeverity(alert: DependabotAlert) {
  switch (alert.security_vulnerability.severity) {
    case 'low':
      return 3.0;
    case 'medium':
      return 6.0;
    case 'high':
      return 9.0;
    case 'critical':
      return 10.0;
  }
}

function getStatus(alert: DependabotAlert) {
  switch (alert.state) {
    case 'open':
      return {category: 'Open', detail: alert.state};
    case 'dismissed':
      return {
        category: 'Ignored',
        detail: alert.dismissed_reason ?? alert.state,
      };
    case 'auto_dismissed':
      return {category: 'Ignored', detail: alert.state};
    case 'fixed':
      return {category: 'Resolved', detail: alert.state};
    default:
      return {category: 'Custom', detail: alert.state};
  }
}
