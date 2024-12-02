import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Enterprise} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class FarosEnterprises extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const enterprise = record.record.data as Enterprise;
    return [
      {
        model: 'vcs_Organization',
        record: {
          uid: GitHubCommon.enterpriseUid(enterprise.slug),
          source: this.streamName.source,
          name: enterprise.name ?? enterprise.slug,
          htmlUrl: enterprise.url,
          type: {category: 'Custom', detail: 'Enterprise'},
          createdAt: Utils.toDate(enterprise.createdAt),
        },
      },
    ];
  }
}
