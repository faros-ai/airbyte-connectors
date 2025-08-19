import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosPipelineOutput} from 'faros-airbyte-common/gitlab';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabConverter} from './common';

export class FarosPipelines extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as FarosPipelineOutput;
    const res: DestinationRecord[] = [];

    const cicdOrganization = {uid: toLower(pipeline.group_id), source};
    const cicdPipeline = {
      organization: cicdOrganization,
      uid: toLower(pipeline.project_path),
    };

    const vcsOrganization = {uid: toLower(pipeline.group_id), source};
    const vcsRepository = {
      name: toLower(
        pipeline.project_path.split('/').pop() || pipeline.project_path
      ),
      uid: toLower(pipeline.project_path),
      organization: vcsOrganization,
    };

    // Convert pipeline status to Faros build status
    const status = this.convertBuildStatus(pipeline.status);
    const endedAt =
      status.category === 'Running' || status.category === 'Queued'
        ? null
        : Utils.toDate(pipeline.updated_at);

    const buildKey = {
      uid: String(pipeline.id),
      pipeline: cicdPipeline,
    };

    // Create the cicd_Build record
    res.push({
      model: 'cicd_Build',
      record: {
        ...buildKey,
        number: pipeline.id,
        status,
        name: pipeline.project_path,
        url: pipeline.web_url,
        createdAt: Utils.toDate(pipeline.created_at),
        startedAt: pipeline.started_at
          ? Utils.toDate(pipeline.started_at as string)
          : Utils.toDate(pipeline.created_at),
        endedAt,
        duration: pipeline.duration,
      },
    });

    // Create the cicd_BuildCommitAssociation if we have a commit SHA
    if (pipeline.sha) {
      const commit = {
        sha: pipeline.sha,
        uid: pipeline.sha,
        repository: vcsRepository,
      };

      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: buildKey,
          commit,
        },
      });
    }

    return res;
  }

  private convertBuildStatus(status: string): {
    category: string;
    detail: string;
  } {
    const lowerStatus = status.toLowerCase();

    switch (lowerStatus) {
      case 'success':
        return {category: 'Success', detail: 'Success'};
      case 'failed':
        return {category: 'Failure', detail: 'Failed'};
      case 'canceled':
      case 'cancelled':
        return {category: 'Canceled', detail: 'Canceled'};
      case 'running':
        return {category: 'Running', detail: 'Running'};
      case 'pending':
        return {category: 'Queued', detail: 'Pending'};
      case 'created':
        return {category: 'Queued', detail: 'Created'};
      case 'manual':
        return {category: 'Queued', detail: 'Manual'};
      case 'preparing':
        return {category: 'Queued', detail: 'Preparing'};
      case 'scheduled':
        return {category: 'Queued', detail: 'Scheduled'};
      case 'skipped':
        return {category: 'Skipped', detail: 'Skipped'};
      default:
        return {category: 'Unknown', detail: status};
    }
  }
}
