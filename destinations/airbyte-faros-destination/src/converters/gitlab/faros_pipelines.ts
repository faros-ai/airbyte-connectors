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
      name: toLower(pipeline.project_path),
      uid: toLower(pipeline.project_path),
      organization: vcsOrganization,
    };

    // Convert pipeline status to Faros build status
    const status = this.convertBuildStatus(pipeline.status);

    // Use finished_at if available, otherwise use updated_at for non-running pipelines
    const endedAt = this.getEndedAt(pipeline, status);
    const startedAt = this.getStartedAt(pipeline);

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
        startedAt,
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

  private getEndedAt(
    pipeline: FarosPipelineOutput,
    status: {category: string}
  ): Date | null {
    // For running or queued pipelines, there's no end time yet
    if (status.category === 'Running' || status.category === 'Queued') {
      return null;
    }

    // Prefer finished_at if available, fall back to updated_at
    return pipeline.finished_at
      ? Utils.toDate(pipeline.finished_at as string)
      : Utils.toDate(pipeline.updated_at);
  }

  private getStartedAt(pipeline: FarosPipelineOutput): Date {
    // Prefer started_at if available, fall back to created_at
    return pipeline.started_at
      ? Utils.toDate(pipeline.started_at as string)
      : Utils.toDate(pipeline.created_at);
  }

  private convertBuildStatus(status: string): {
    category: string;
    detail: string;
  } {
    const lowerStatus = status.toLowerCase();

    switch (lowerStatus) {
      case 'success':
        return {category: 'Success', detail: status};
      case 'failed':
        return {category: 'Failure', detail: status};
      case 'canceled':
      case 'cancelled':
        return {category: 'Canceled', detail: status};
      case 'running':
        return {category: 'Running', detail: status};
      case 'pending':
      case 'created':
      case 'manual':
      case 'preparing':
      case 'scheduled':
      case 'waiting_for_resource':
        return {category: 'Queued', detail: status};
      case 'skipped':
        return {category: 'Skipped', detail: status};
      default:
        return {category: 'Unknown', detail: status};
    }
  }
}
