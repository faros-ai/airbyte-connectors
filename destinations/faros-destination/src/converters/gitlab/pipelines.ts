import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

export class GitlabPipelines extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const pipeline = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(
      pipeline.web_url,
      source
    );

    if (!repository) return res;

    const status = this.convertBuildStatus(pipeline.status);
    const endedAt =
      status.category == 'Running' || status.category == 'Queued'
        ? null
        : Utils.toDate(pipeline.updated_at);

    const pipelineKey = {
      organization: repository.organization,
      uid: repository.name,
    };

    res.push({
      model: 'cicd_Build',
      record: {
        uid: String(pipeline.id),
        number: pipeline.id,
        pipeline: pipelineKey,
        status,
        url: pipeline.web_url,
        startedAt: Utils.toDate(pipeline.created_at),
        endedAt,
      },
    });

    return res;
  }

  // GitLab defined status for:
  // >> pipelines (aka builds): created, waiting_for_resource, preparing, pending,
  //    running, success, failed, canceled, skipped, manual, scheduled
  // >> jobs: created, pending, running, failed, success, canceled, skipped, or manual.
  private convertBuildStatus(status?: string): CategoryRef {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = status?.toLowerCase();
    switch (detail) {
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'created':
      case 'manual':
      case 'pending':
      case 'preparing':
      case 'scheduled':
      case 'waiting_for_resource':
        return {category: 'Queued', detail};
      case 'skipped':
      default:
        return {category: 'Custom', detail};
    }
  }
}
