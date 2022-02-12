import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AzurepipelineConverter} from './common';
import {Release} from './models';

export class AzurepipelineReleases extends AzurepipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data as Release;

    const createdAt = Utils.toDate(release.createdOn);
    const releasedAt = Utils.toDate(release.modifiedOn);
    return [
      {
        model: 'cicd_Release',
        record: {
          uid: String(release.id),
          name: release.name,
          htmlUrl: release.url,
          description: release.description,
          draft: release.keepForever,
          createdAt,
          releasedAt,
          author: {uid: release.modifiedBy.id, source},
          source,
        },
      },
    ];
  }
}
