import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {CategoryRef, GitlabCommon, GitlabConverter} from './common';

export class GitlabJobs extends GitlabConverter {
  private readonly logger: AirbyteLogger;

  constructor() {
    super();
    this.logger = new AirbyteLogger();
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  private readonly pipelinesStream = new StreamName('gitlab', 'pipelines');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.pipelinesStream];
  }

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const job = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(job.web_url, source);
    const pipelinesStream = this.pipelinesStream.stringify();
    const pipeline = ctx.get(pipelinesStream, String(job.pipeline_id));
    const pipelineId = pipeline?.record?.data?.id;

    if (!repository || !pipelineId) {
      const message = !pipelineId
        ? `Could not find pipelineId from StreamContext for this record:
          ${this.id}:${job.pipeline_id}`
        : `Could not find repository from web_url: ${this.id}:${job.web_url}`;
      this.logger.warn(message);
      return [];
    }

    const buildKey = {
      uid: String(pipelineId),
      pipeline: {
        organization: repository.organization,
        uid: repository.name,
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
