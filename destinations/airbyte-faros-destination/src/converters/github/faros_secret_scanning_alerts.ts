import {AirbyteRecord} from 'faros-airbyte-cdk';
import {SecretScanningAlert} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosSecretScanningAlerts extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'vcs_RepositoryVulnerability',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const alert = record.record.data as SecretScanningAlert;
    const repository = GitHubCommon.repoKey(
      alert.org,
      alert.repo,
      this.streamName.source
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid: alert.html_url,
          source: this.streamName.source,
          title: alert.secret_type_display_name ?? alert.secret_type,
          description: alert.secret,
          // vulnerabilityIds: [],
          // severity: 0.0,
          url: alert.html_url,
          // discoveredAt: Utils.toDate(''),
          // discoveredBy: '',
          // publishedAt: Utils.toDate(''),
          // publishedBy: '',
          // remediatedAt: Utils.toDate(''),
          // remediatedInVersions: [],
          // affectedVersions: [],
        },
      },
      {
        model: 'vcs_RepositoryVulnerability',
        record: {
          vulnerability: {uid: alert.html_url, source: this.streamName.source},
          repository,
          // task: {},
          url: alert.html_url,
          // dueAt: Utils.toDate(''),
          createdAt: Utils.toDate(alert.created_at),
          // acknowledgedAt: Utils.toDate(''),
          resolvedAt: Utils.toDate(alert.resolved_at) ?? null,
          status: getStatus(alert),
        },
      },
    ];
  }
}

function getStatus(alert: SecretScanningAlert) {
  switch (alert.state) {
    case 'open':
      return {category: 'Open', detail: alert.state};
    case 'resolved':
      return {category: 'Resolved', detail: alert.resolution ?? alert.state};
    default:
      return {category: 'Custom', detail: alert.state};
  }
}
