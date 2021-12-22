import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Job} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_Job'];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data as Job;
    return [
      {
        model: 'ims_Job',
        record: {
          uid: job.uuid,
          type: job.type,
          label: job.label,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          triggeredCreatedAt: job.triggered?.createdAt,
          triggeredStartedAt: job.triggered?.startedAt,
          triggeredFinishedAt: job.triggered?.finishedAt,
          unblockedAt: job.unblockedAt,
          state: job.state,
          url: job.url,
          command: job.command,
          source,
        },
      },
    ];
  }
}
