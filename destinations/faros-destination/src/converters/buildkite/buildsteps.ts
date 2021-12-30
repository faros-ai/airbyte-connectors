import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Job} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data as Job;
    const build = {uid: job.build.uuid, source};
    const createdAt = Utils.toDate(job.createdAt);
    const startedAt = Utils.toDate(job.startedAt);
    const endedAt = Utils.toDate(job.finishedAt);
    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: job.uuid,
          command: job.command,
          type: job.type,
          createdAt,
          startedAt,
          endedAt,
          state: job.state,
          url: job.url,
          build,
          source,
        },
      },
    ];
  }
}
