import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {CategoryRef, GitlabCommon, GitlabConverter} from './common';

export class Jobs extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  private readonly pipelinesStream = new StreamName('gitlab', 'pipelines');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.pipelinesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const job = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(job.web_url, source);
    const pipelinesStream = this.pipelinesStream.asString;
    const pipeline = ctx.get(pipelinesStream, String(job.pipeline_id));
    const pipelineId = pipeline?.record?.data?.id;

    if (!repository || !pipelineId) {
      const message = !pipelineId
        ? `Could not find pipeline for id ${job.pipeline_id}`
        : `Could not find repository from job web url ${job.web_url}`;
      ctx.logger.warn(message);
      return [];
    }

    const buildKey = {
      uid: String(pipelineId),
      pipeline: {
        organization: repository.organization,
        uid: repository.uid,
      },
    };

    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          name: job.name,
          type: this.convertBuildStepType(job.stage),
          createdAt: Utils.toDate(job.created_at),
          startedAt: Utils.toDate(job.started_at),
          endedAt: Utils.toDate(job.finished_at),
          status: GitlabCommon.convertBuildStatus(job.status),
          url: job.web_url,
          build: buildKey,
        },
      },
    ];
  }

  private convertBuildStepType(stage?: string): CategoryRef {
    if (!stage) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const detail = stage?.toLowerCase();
    switch (detail) {
      case 'script':
        return {category: 'Script', detail};
      case 'manual':
        return {category: 'Manual', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
