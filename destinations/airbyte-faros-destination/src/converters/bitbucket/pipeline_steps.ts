import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  Pipeline,
  PipelineStep,
  PipelineStepState,
} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {BitbucketConverter, CategoryRef} from './common';

enum BuildStatusCategory {
  CANCELED = 'Canceled',
  FAILED = 'Failed',
  QUEUED = 'Queued',
  RUNNING = 'Running',
  SUCCESS = 'Success',
  UNKNOWN = 'Unknown',
  CUSTOM = 'Custom',
}

export class PipelineSteps extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  private readonly pipelinesStream = new StreamName('bitbucket', 'pipelines');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.pipelinesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const step = record.record.data as PipelineStep;

    const pipelinesStream = this.pipelinesStream.asString;
    const pipelinesRecord = ctx.get(pipelinesStream, step.pipeline.uuid);
    const pipeline = pipelinesRecord?.record?.data as undefined | Pipeline;

    const [workspace, repo] = (pipeline?.repository?.fullName || '').split('/');
    if (!workspace || !repo) return [];

    const orgKey = {uid: workspace.toLowerCase(), source};
    const pipelineKey = {organization: orgKey, uid: repo.toLowerCase()};
    const build = {pipeline: pipelineKey, uid: pipeline.uuid};

    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: step.uuid,
          name: step.name,
          startedAt: Utils.toDate(step.startedOn),
          endedAt: Utils.toDate(step.completedOn),
          status: this.convertBuildStatus(step.state),
          build,
        },
      },
    ];
  }

  private convertBuildStatus(state?: PipelineStepState): CategoryRef {
    if (!state) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    // We're more interest in the "result" than the "state" as this tells the true
    // state of a pipeline build. The switch statement however takes care of all
    // possible entries from both the "result" and "state".
    const detail = (state.result?.name || state.name)?.toLowerCase();
    switch (detail) {
      case 'error':
      case 'failed':
        return {category: BuildStatusCategory.FAILED, detail};
      case 'in_progress':
      case 'running':
        return {category: BuildStatusCategory.RUNNING, detail};
      case 'pending':
        return {category: BuildStatusCategory.QUEUED, detail};
      case 'stopped':
        return {category: BuildStatusCategory.CANCELED, detail};
      case 'completed':
      case 'successful':
        return {category: BuildStatusCategory.SUCCESS, detail};
      default:
        return {category: BuildStatusCategory.CUSTOM, detail};
    }
  }
}
