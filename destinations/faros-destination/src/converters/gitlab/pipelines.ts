import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

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

    const status = GitlabCommon.convertBuildStatus(pipeline.status);
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
}
