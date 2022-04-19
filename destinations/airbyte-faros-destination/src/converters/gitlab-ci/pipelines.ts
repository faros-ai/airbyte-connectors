import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Pipelines extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data;
    const res: DestinationRecord[] = [];

    const repository = GitlabCommon.parseRepositoryKey(pipeline.webUrl, source);

    if (!repository) return [];

    const status = GitlabCommon.convertBuildStatus(pipeline.status);
    const endedAt =
      status.category == 'Running' || status.category == 'Queued'
        ? null
        : Utils.toDate(pipeline.updatedAt);

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
        url: pipeline.webUrl,
        startedAt: Utils.toDate(pipeline.createdAt),
        endedAt,
      },
    });

    res.push({
      model: 'cicd_BuildCommitAssociation',
      record: {
        build: {uid: String(pipeline.id), pipeline: pipelineKey},
        commit: {repository, sha: pipeline.commitSha},
      },
    });

    return res;
  }
}
