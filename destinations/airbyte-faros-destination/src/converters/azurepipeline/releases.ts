import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Release} from 'faros-airbyte-common/azurepipeline';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzurePipelineConverter} from './common';

export class Releases extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data as Release;
    const res: DestinationRecord[] = [];

    const createdAt = Utils.toDate(release.createdOn);
    const releasedAt = Utils.toDate(release.modifiedOn);
    res.push({
      model: 'cicd_Release',
      record: {
        uid: String(release.id),
        name: release.name,
        htmlUrl: release.url,
        description: release.description,
        createdAt,
        releasedAt,
        source,
      },
    });

    return res;
  }
}
