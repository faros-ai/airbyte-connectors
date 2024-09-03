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
    const uid = GitHubCommon.vulnerabilityUid(
      alert.org,
      alert.repo,
      'secret-scanning',
      alert.number
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid,
          source: this.streamName.source,
          title: alert.secret_type_display_name ?? alert.secret_type,
          description: alert.secret,
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
