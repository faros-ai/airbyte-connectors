import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {GitlabCommon, GitlabConverter} from '../common/gitlab';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';

export class Pipelines extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(
      pipeline.web_url,
      source
    );

    if (!repository) return [];

    const status = GitlabCommon.convertBuildStatus(pipeline.status);
    const endedAt =
      status.category == 'Running' || status.category == 'Queued'
        ? null
        : Utils.toDate(pipeline.updated_at);

    const pipelineKey = {
      organization: repository.organization,
      uid: repository.name,
    };

    return [
      {
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
      },
    ];
  }
}
