import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Job} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Job'];
  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data as Job;

    const createdAt = Utils.toDate(job.createdAt);
    const startedAt = Utils.toDate(job.startedAt);
    const finishedAt = Utils.toDate(job.finishedAt);
    const triggeredCreatedAt = Utils.toDate(job.triggered?.createdAt);
    const triggeredStartedAt = Utils.toDate(job.triggered?.startedAt);
    const triggeredFinishedAt = Utils.toDate(job.triggered?.finishedAt);
    const unblockedAt = Utils.toDate(job.unblockedAt);
    return [
      {
        model: 'cicd_Job',
        record: {
          uid: job.uuid,
          type: job.type,
          label: job.label,
          createdAt,
          startedAt,
          finishedAt,
          triggeredCreatedAt,
          triggeredStartedAt,
          triggeredFinishedAt,
          unblockedAt,
          state: job.state,
          url: job.url,
          command: job.command,
          source,
        },
      },
    ];
  }
}
