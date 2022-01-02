import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BuildkiteConverter, Job} from './common';

export class BuildkiteJobs extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data as Job;
    const build = {
      uid: job.build.uuid,
      pipeline: {
        uid: job.build.pipeline.slug,
        organization: {uid: job.build.pipeline.organization.slug, source},
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

  convertBuildStepTime(buildStep: Job): {
    createdAt?: Date;
    startedAt?: Date;
    endedAt?: Date;
  } {
    const type = buildStep.type;
    const defaultTime = {
      createdAt: Utils.toDate(buildStep.createdAt),
      startedAt: Utils.toDate(buildStep.startedAt),
      endedAt: Utils.toDate(buildStep.finishedAt),
    };
    if (!type) {
      return defaultTime;
    }
    switch (type) {
      case 'JobTypeBlock':
        return {
          createdAt: Utils.toDate(buildStep.unblockedAt),
          startedAt: Utils.toDate(buildStep.unblockedAt),
          endedAt: Utils.toDate(buildStep.unblockedAt),
        };
      case 'JobTypeTrigger':
        return {
          createdAt: Utils.toDate(buildStep.triggered.createdAt),
          startedAt: Utils.toDate(buildStep.triggered.startedAt),
          endedAt: Utils.toDate(buildStep.triggered.finishedAt),
        };
      case 'JobTypeWait': // This type does not currently have timestamps
      case 'JobTypeCommand':
      default:
        return defaultTime;
    }
  }

  convertBuildStepState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    // Read more on Buildkite job states:
    // https://buildkite.com/user/graphql/documentation/type/JobStates
    switch (detail) {
      case 'canceling':
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'blocked_failed':
      case 'broken':
      case 'timed_out':
      case 'timing_out':
      case 'unblocked_failed':
      case 'waiting_failed':
        return {category: 'Failed', detail};
      case 'finished':
        return {category: 'Success', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'scheduled':
      case 'accepted':
      case 'assigned':
      case 'blocked':
      case 'limited':
      case 'limiting':
      case 'waiting':
        return {category: 'Queued', detail};
      case 'skipped':
      case 'pending':
      case 'unblocked':
      default:
        return {category: 'Custom', detail};
    }
  }

  convertBuildStepType(type: string): {
    category: string;
    detail: string;
  } {
    if (!type) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const detail = type;
    switch (type) {
      case 'JobTypeCommand':
        return {category: 'Script', detail};
      case 'JobTypeBlock':
        return {category: 'Manual', detail};
      case 'JobTypeWait':
      default:
        return {category: 'Custom', detail};
    }
  }
}
