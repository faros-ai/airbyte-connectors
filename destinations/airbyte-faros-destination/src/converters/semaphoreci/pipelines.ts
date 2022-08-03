import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {SemaphoreCICommon, SemaphoreCIConverter} from './common';
import {Pipeline} from './models';

export class Pipelines extends SemaphoreCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Pipeline',
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.ppl_id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pipelineRecord = record.record.data as Pipeline;
    const source = this.streamName.source;

    /*
     * Pipeline
     */
    const organizationKey = {
      uid: pipelineRecord.project.metadata.org_id,
      source,
    };

    const pipeline = {
      model: 'cicd_Pipeline',
      record: {
        uid: pipelineRecord.name,
        name: pipelineRecord.name,
        organization: organizationKey,
      },
    };

    /*
     * Build
     */
    const buildKey = {
      uid: pipeline.record.uid,
      organization: organizationKey,
    };

    const build = {
      model: 'cicd_Build',
      record: {
        uid: pipelineRecord.ppl_id,
        name: pipelineRecord.name,
        createdAt: pipelineRecord.created_at,
        startedAt: pipelineRecord.running_at,
        endedAt: pipelineRecord.done_at,
        url: SemaphoreCICommon.buildPipelineUrl(pipelineRecord),
        status: SemaphoreCICommon.convertBuildState(pipelineRecord.result),
        pipeline: buildKey,
      },
    };

    /*
     * BuildCommitAssociation
     */
    const repositoryKey = {
      uid: pipelineRecord.project_id,
      organization: organizationKey,
    };

    pipelineRecord.commit_sha;

    const buildCommitAssociation = {
      model: 'cicd_BuildCommitAssociation',
      record: {
        build: buildKey,
        commit: {
          sha: pipelineRecord.commit_sha,
          uid: pipelineRecord.commit_sha,
          repository: repositoryKey,
        },
      },
    };

    return [pipeline, build, buildCommitAssociation];
  }
}
