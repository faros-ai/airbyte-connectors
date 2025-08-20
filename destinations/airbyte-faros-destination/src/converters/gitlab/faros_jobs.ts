import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosJobOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CategoryRef, GitlabCommon, GitlabConverter} from './common';

export class FarosJobs extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_BuildStep',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const job = record.record.data as FarosJobOutput;

    const cicdOrganization = {uid: toLower(job.group_id), source};
    const cicdPipeline = {
      organization: cicdOrganization,
      uid: toLower(job.project_path),
    };

    const buildKey = {
      uid: String(job.pipeline_id),
      pipeline: cicdPipeline,
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
      case 'build':
        return {category: 'Build', detail};
      case 'test':
        return {category: 'Test', detail};
      case 'deploy':
        return {category: 'Deploy', detail};
      case 'script':
        return {category: 'Script', detail};
      case 'manual':
        return {category: 'Manual', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
