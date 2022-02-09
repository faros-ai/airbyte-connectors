import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Job} from './common';

export class BuildkiteJobs extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const job = record.record.data as Job;
    const build = {
      uid: job.build?.uuid,
      pipeline: {
        uid: job.build?.pipeline?.slug,
        organization: {uid: job.build?.pipeline?.organization?.slug, source},
      },
    };
    const createdAt = Utils.toDate(job.createdAt);
    const startedAt = Utils.toDate(job.startedAt);
    const endedAt = Utils.toDate(job.finishedAt);
    const status = this.convertBuildStepState(job.state);
    const type = this.convertBuildStepType(job.type);
    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: job.uuid,
          name: job.label,
          ...this.convertBuildStepTime(job),
          command: job.command,
          type,
          createdAt,
          startedAt,
          endedAt,
          status,
          url: job.url,
          build,
        },
      },
    ];
  }
}
