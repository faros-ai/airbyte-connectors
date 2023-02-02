import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Pipelines extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data;
    const res: DestinationRecord[] = [];

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
      uid: repository.uid,
    };

    const build = {
      uid: String(pipeline.id),
      number: pipeline.id,
      pipeline: pipelineKey,
      status,
      name: repository.name,
      url: pipeline.web_url,
      createdAt: Utils.toDate(pipeline.created_at),
      startedAt: Utils.toDate(pipeline.created_at),
      endedAt,
    };

    res.push({
      model: 'cicd_Build',
      record: build,
    });

    if (pipeline.sha) {
      const commit = {
        sha: pipeline.sha,
        uid: pipeline.sha,
        repository: repository,
      };

      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: {uid: build.uid, pipeline: pipelineKey},
          commit,
        },
      });
    }

    return res;
  }
}
