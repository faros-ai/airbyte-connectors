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

  readonly alertType = 'code-scanning';

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
      this.alertType,
      alert.number
    );
    return [
      {
        model: 'sec_Vulnerability',
        record: {
          uid,
          source: this.streamName.source,
          type: GitHubCommon.vulnerabilityType(alert, this.alertType),
          title: alert.rule.name ?? alert.rule.id,
          description: Utils.cleanAndTruncate(alert.rule.description),
          severity: GitHubCommon.vulnerabilitySeverity(alert),
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
          status: GitHubCommon.vulnerabilityStatus(alert),
        },
      },
    ];
  }
}
