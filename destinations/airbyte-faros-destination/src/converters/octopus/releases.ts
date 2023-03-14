import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';

export class Releases extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Release',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const release = record.record.data;

    res.push({
      model: 'cicd_Release',
      record: {
        uid: release.Id,
        name: `${release.ProjectName}:${release.Version}`,
        createdAt: Utils.toDate(release.Assembled),
        source,
      },
    });

    return res;
  }
}
