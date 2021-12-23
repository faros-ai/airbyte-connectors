import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Build, BuildkiteConverter} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Build'];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const build = record.record.data as Build;

    const createdAt = Utils.toDate(build.createdAt);
    const startedAt = Utils.toDate(build.startedAt);
    const finishedAt = Utils.toDate(build.finishedAt);
    return [
      {
        model: 'ims_Build',
        record: {
          uid: build.uid,
          number: build.number,
          createdAt,
          startedAt,
          finishedAt,
          state: build.state,
          url: build.url,
          commit: build.commit,
          source,
        },
      },
    ];
  }
}
