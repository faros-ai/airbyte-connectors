import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Build, BuildkiteConverter} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const build = record.record.data as Build;

    const createdAt = Utils.toDate(build.createdAt);
    const startedAt = Utils.toDate(build.startedAt);
    const endedAt = Utils.toDate(build.finishedAt);
    return [
      {
        model: 'cicd_Build',
        record: {
          uid: build.uuid,
          number: build.number,
          createdAt,
          startedAt,
          endedAt,
          state: build.state,
          url: build.url,
          source,
        },
      },
    ];
  }
}
