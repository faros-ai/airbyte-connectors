import {AirbyteRecord} from 'faros-airbyte-cdk';
import {CodeScanningAlert} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosCodeScanningAlerts extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'vcs_RepositoryVulnerability',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const alert = record.record.data as CodeScanningAlert;
    const repository = GitHubCommon.repoKey(
      alert.org,
      alert.repo,
      this.streamName.source
    );
    const uid = GitHubCommon.vulnerabilityUid(
      alert.org,
      alert.repo,
      'code-scanning',
      alert.number
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid,
          source: this.streamName.source,
          title: alert.rule.name ?? alert.rule.id,
          description: Utils.cleanAndTruncate(alert.rule.description, 200),
          severity: getSeverity(alert),
          url: alert.html_url,
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
            null,
          status: getStatus(alert),
        },
      },
    ];
  }
}

function getSeverity(alert: CodeScanningAlert) {
  switch (alert.rule.security_severity_level) {
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

function getStatus(alert: CodeScanningAlert) {
  switch (alert.state) {
    case 'open':
      return {category: 'Open', detail: alert.state};
    case 'dismissed':
      return {
        category: 'Ignored',
        detail: alert.dismissed_reason ?? alert.state,
      };
    case 'fixed':
      return {category: 'Resolved', detail: alert.state};
    default:
      return {category: 'Custom', detail: alert.state};
  }
}
