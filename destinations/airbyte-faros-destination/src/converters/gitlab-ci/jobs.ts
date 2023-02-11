import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {CategoryRef, GitlabCommon, GitlabConverter} from '../gitlab/common';

export class Jobs extends GitlabConverter {
  source = 'GitLab-CI';

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  private readonly pipelinesStream = new StreamName('gitlab-ci', 'pipelines');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [this.pipelinesStream];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const job = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(job.webUrl, source);
    const pipelinesStream = this.pipelinesStream.asString;
    const pipeline = ctx.get(pipelinesStream, String(job.pipeline.id));
    const pipelineId = pipeline?.record?.data?.id;

    if (!repository || !pipelineId) {
      const message = !pipelineId
        ? `Could not find pipeline for id ${job.pipeline_id}`
        : `Could not find repository from job web url ${job.web_url}`;
      ctx.logger.warn(message);
      return [];
    }

    const buildKey = GitlabCommon.createBuildKey(pipelineId, repository);

    return [
      {
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          name: job.name,
          type: this.convertBuildStepType(job.stage),
          createdAt: Utils.toDate(job.createdAt),
          startedAt: Utils.toDate(job.startedAt),
          endedAt: Utils.toDate(job.finishedAt),
          status: GitlabCommon.convertBuildStatus(job.status),
          url: job.webUrl,
          build: buildKey,
        },
      },
    ];
  }

  private convertBuildStepType(stage?: string): CategoryRef {
    if (!stage) {
      return {category: 'Custom', detail: 'undefined'};
    }
    const detail = stage;
    const lowerCaseDetail = detail.toLowerCase();
    switch (lowerCaseDetail) {
      case 'script':
        return {category: 'Script', detail};
      case 'manual':
        return {category: 'Manual', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
